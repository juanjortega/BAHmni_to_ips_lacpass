'use strict'
import express from 'express'
import axios from 'axios'
import { registerMediator } from 'openhim-mediator-utils'
import mediatorConfig from './mediatorConfig.json'
import https from 'https';  // Importa el módulo https


// Crea un agente que ignore certificados no válidos
const agent = new https.Agent({
  rejectUnauthorized: false
});


// Configuración de OpenHIM
const openhimConfig = {
  username: 'root@openhim.org',
  password: '1234',
  apiURL: 'https://54.232.153.120:8080',
  trustSelfSigned: true
}

// Registrar el mediador en OpenHIM
registerMediator(openhimConfig, mediatorConfig, err => {
  if (err) {
    throw new Error(`Failed to register mediator. Check your Config. ${err}`)
  }
})

// Crear un servidor Express
const app = express()
app.use(express.json())

// Endpoint para recibir las solicitudes del feed
app.post('/', async (req, res) => {
  const feedEntry = req.body
  console.log("Request Entrante",feedEntry);


  //try {
  // 1. Consultar el endpoint de OpenMRS Bahmni para obtener información de vacunas y diagnósticos
  const encounterUrl = `https://ec2-54-233-236-225.sa-east-1.compute.amazonaws.com${feedEntry.content}`
  const user = "superman"
  const pass = "Admin123"
  const authHeaders = Buffer.from(`${user}:${pass}`).toString('base64')
  const encounterResponse = await axios.get(encounterUrl,{
    headers:{
      'Authorization':`Basic ${authHeaders}`
    },
    httpsAgent: agent  // Aquí añades el agente que ignora el certificado
  })
  const encounterData = encounterResponse.data

  const patientLocalIden = encounterData.patientId.replace("RUT","")


  // 2. Obtener el identificador internacional del paciente mediante ITI-78 (PDQm)
  const patientInternationalId = await getPatientIdentifier(patientLocalIden)



  if (!patientInternationalId) {
    return res.status(400).send('No se pudo obtener el identificador internacional del paciente.')
  }

  // 3. Traducir los conceptos con Snowstorm (FHIR ConceptMap Translate)
  const translatedConcepts = await translateConcepts(encounterData)  // hay que hacer cliclo y map para cada concepto.

  // 4. Crear un JSON con estructura FHIR IPS
  const fhirIpsBundle = createFhirIpsBundle(translatedConcepts, patientInternationalId)

  // 5. Validar el JSON FHIR IPS con HIE Gazelle
  const validationResult = await validateWithGazelle(fhirIpsBundle)

  if (validationResult.isValid) {
    // 5. Si está validado, enviar el JSON FHIR al servidor FHIR con ITI-65
    await sendToFhirServer(fhirIpsBundle)
    res.status(200).send('Proceso completado y datos enviados a FHIR Server.')
  } else {
    res.status(400).send('Validación fallida.')
  }
  // } catch (error) {
  //   console.error('Error procesando el feed:', error)
  //   res.status(500).send('Error en el procesamiento.')
  // }
})

// Función para consultar el identificador internacional del paciente usando ITI-78 (PDQm)
async function getPatientIdentifier(patientLocalIden) {
  const pdqmUrl = `http://15.228.12.79:8080/fhir/Patient?identifier=${patientLocalIden}`

  try {
    const response = await axios.get(pdqmUrl)
    const patient = response.data.entry[0].resource.identifier





    // Aquí se obtiene el identificador internacional
    const findingInternacionalCode = patient.find((x)=> x.system === "urn:oid:1.2.36.146.595.217.0.1")
    const internacionalValue = findingInternacionalCode.system
    return internacionalValue ? internacionalValue : null
  } catch (error) {
    console.error('Error obteniendo el identificador internacional del paciente:', error)
    return null
  }
}

// Función para traducir conceptos con Snowstorm
async function translateConcepts(encounterData) {
  const translatedConcepts = []
  for (const concept of encounterData.obs) {
    const translateUrl = `https://15.228.112.79:8180/fhir/ConceptMap/$translate?code=${concept.concept}&system=http://snomed.info/sct`
    const translationResponse = await axios.get(translateUrl)
    translatedConcepts.push(translationResponse.data)
  }
  return translatedConcepts
}

// Función para crear un JSON con estructura FHIR IPS
function createFhirIpsBundle(translatedConcepts) {
  return {
    resourceType: 'Bundle',
    type: 'document',
    entry: translatedConcepts.map((concept) => ({
      resource: {
        resourceType: 'Condition',
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: concept.target.code,
              display: concept.target.display
            }
          ]
        }
      }
    }))
  }
}

// Función para validar con HIE Gazelle
async function validateWithGazelle(fhirBundle) {
  const gazelleUrl = 'https://15.228.112.79/validate'
  const response = await axios.post(gazelleUrl, fhirBundle)
  return response.data
}

// Función para enviar al servidor FHIR con ITI-65
async function sendToFhirServer(fhirBundle) {
  const fhirServerUrl = 'https://15.228.112.79:3000/fhir/Bundle'
  await axios.post(fhirServerUrl, fhirBundle, {
    headers: {
      'Content-Type': 'application/fhir+json'
    }
  })
}

// Iniciar el servidor Express
app.listen(4000, () => {
  console.log('Mediador escuchando en el puerto 4000...')
})
