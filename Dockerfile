# Usa una versión más reciente de Node.js
FROM node:18-alpine

# Establece el directorio de trabajo
WORKDIR /app

# Copia los archivos del proyecto al contenedor
COPY . /app

# Instala las dependencias
RUN npm install

# Exponer el puerto 3000
EXPOSE 4000

# Comando para iniciar la aplicación
CMD ["npm", "start"]
