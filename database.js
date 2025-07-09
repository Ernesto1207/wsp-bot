const mysql = require('mysql2');
const { dbConfig } = require('./config');

const db = mysql.createPool({
  ...dbConfig,
  connectionLimit: 10,
  waitForConnections: true,
  connectTimeout: 10000,
});

const getLastClinicalHistory = (patientId) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM historias_clinicas WHERE paciente_id = ? ORDER BY fecha_creacion DESC LIMIT 1', [patientId], (err, results) => {
      if (err) {
        reject(err);
      } else {
        resolve(results[0]);
      }
    });
  });
};

const getUserByDocumentNumber = (documentNumber) => {
  return new Promise((resolve, reject) => {
    db.query('SELECT * FROM paciente WHERE id = ?', [documentNumber], (err, results) => {
      if (err) {
        reject(err);
      } else {
        console.log('Resultado de la consulta del paciente:', results[0]);
        resolve(results[0]);
      }
    });
  });
};

module.exports = { getUserByDocumentNumber, getLastClinicalHistory };
