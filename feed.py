import requests
import feedparser
import mysql.connector
import time

# Configurar la conexión a la base de datos
# Configurar la conexión a la base de datos principal (openmrs)
def connect_to_db():
    try:
        connection = mysql.connector.connect(
            host="ec2-54-233-236-225.sa-east-1.compute.amazonaws.com",
            user="root",
            password="Minsal.2024,",  # Reemplaza con la contraseña correcta
            database="openmrs"
        )
        return connection
    except mysql.connector.Error as err:
        print(f"Error conectando a la base de datos principal: {err}")
        return None

# Conectar a la base de datos donde se almacenan los eventos procesados (event_processing)
def connect_to_processed_db():
    try:
        connection = mysql.connector.connect(
            host="ec2-54-233-236-225.sa-east-1.compute.amazonaws.com",
            user="root",
            password="Minsal.2024,",  # Reemplaza con la contraseña correcta
            database="event_processing"
        )
        return connection
    except mysql.connector.Error as err:
        print(f"Error conectando a la base de datos de eventos procesados: {err}")
        return None


# Verificar si un evento ya ha sido procesado
def is_event_processed(event_uuid):
    connection = connect_to_processed_db()
    if connection is None:
        print("No se pudo conectar a la base de datos de eventos procesados.")
        return False

    cursor = connection.cursor()
    query = "SELECT * FROM processed_events WHERE event_uuid = %s"
    cursor.execute(query, (event_uuid,))
    result = cursor.fetchone()
    cursor.close()
    connection.close()
    return result is not None

# Guardar el evento procesado en la base de datos
def mark_event_as_processed(event_uuid):
    connection = connect_to_processed_db()
    if connection is None:
        print("No se pudo conectar a la base de datos de eventos procesados.")
        return

    cursor = connection.cursor()
    query = "INSERT INTO processed_events (event_uuid) VALUES (%s)"
    try:
        cursor.execute(query, (event_uuid,))
        connection.commit()
        print(f"Evento {event_uuid} marcado como procesado.")
    except mysql.connector.Error as err:
        print(f"Error al marcar el evento como procesado: {err}")
    finally:
        cursor.close()
        connection.close()

# Procesar el feed
def process_feed(feed):
    if not feed.entries:
        print("No se encontraron entradas en el feed.")
        return

    for entry in feed.entries:
        title = entry.title
        link = entry.link
        content = entry.content[0].value  # Extraer la URL del contenido CDATA
        event_uuid = entry.id.split(":")[-1]  # Extraer el UUID del evento desde la etiqueta ID
        
        # Verificar si el evento ya ha sido procesado
        if not is_event_processed(event_uuid):
            print(f"Procesando evento: {event_uuid}")
            
            # Enviar el evento a la URL especificada
            data = {"uuid": event_uuid, "title": title, "content": content}
            try:
                #response = requests.post("http://ec2-18-228-197-220.sa-east-1.compute.amazonaws.com:6661", json=data)
                response = requests.post("http://54.232.153.120:5001/entryfeed", json=data)
                #response = requests.post("http://18.228.14.77:4000/", json=data)

                if response.status_code == 200:
                    print(f"Evento {event_uuid} enviado correctamente.")
                    # Marcar el evento como procesado
                    mark_event_as_processed(event_uuid)
                else:
                    print(f"Error al enviar el evento {event_uuid}. Código de estado: {response.status_code}")
            except requests.exceptions.RequestException as e:
                print(f"Error al enviar el evento {event_uuid}: {e}")
        else:
            print(f"Evento {event_uuid} ya fue procesado.")

# Obtener y procesar el feed de Atom con verificación SSL deshabilitada
atom_feed_url = "https://ec2-54-233-236-225.sa-east-1.compute.amazonaws.com/openmrs/ws/atomfeed/encounter/recent"

def get_feed():
    try:
        response = requests.get(atom_feed_url, verify=False)  # Deshabilitar verificación SSL
        response.raise_for_status()  # Levantar una excepción si el estatus HTTP es 4xx/5xx
        feed = feedparser.parse(response.text)  # Analizar el contenido del feed
        return feed
    except requests.exceptions.RequestException as e:
        print(f"Error al obtener el feed: {e}")
        return None

# Bucle infinito para consultar cambios en el feed periódicamente
def monitor_feed(interval=6):
    while True:
        print("Consultando feed...")
        feed = get_feed()
        if feed:
            process_feed(feed)
        print(f"Esperando {interval} segundos antes de la próxima consulta...")
        time.sleep(interval)

# Iniciar la monitorización del feed
monitor_feed(6)  # Consultar cada 60 segundos
