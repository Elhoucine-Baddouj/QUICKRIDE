const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const validator = require('validator');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(session({
  secret: 'your_secret_key',
  resave: false,
  saveUninitialized: false
}));

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root',
  database: 'quickride'
});

connection.connect((err) => {
  if (err) {
    console.error('Erreur de connexion : ' + err.stack);
    return;
  }
  console.log('Connecté à la base de données');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ren.html'));
});

app.get('/client', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client.html'));
});

app.get('/driver', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'driver.html'));
});

app.get('/client_login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'client_login.html'));
});

app.get('/driver_login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'driver_login.html'));
});

app.post('/submit_client', upload.single('photo'), async (req, res) => {
  try {
    const { username, password, phone } = req.body;
    const photo = req.file ? req.file.buffer.toString('base64') : null;

    if (!username || !phone || !password) {
      return res.status(400).send('Tous les champs sont obligatoires');
    }

    if (!validator.isMobilePhone(phone)) {
      return res.status(400).send('Numéro de téléphone invalide');
    }

    if (!validator.isStrongPassword(password, { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })) {
      return res.status(400).send('Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule, un chiffre et un symbole');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = 'INSERT INTO client (username, password, phone, photo) VALUES (?, ?, ?, ?)';
    connection.query(sql, [username, hashedPassword, phone, photo], (err, result) => {
      if (err) {
        return res.status(500).send('Erreur lors de l\'insertion dans la base de données');
      }
      res.redirect('home1.html')
    });
  } catch (error) {
    res.status(500).send('Erreur lors de l\'enregistrement de l\'utilisateur: ' + error.stack);
  }
});

app.post('/submit_driver', async (req, res) => {
  try {
    const { username, password, phone, numT } = req.body;


    if (!validator.isMobilePhone(phone)) {
      return res.status(400).send('Numéro de téléphone invalide');
    }

    if (!validator.isStrongPassword(password, { minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })) {
      return res.status(400).send('Le mot de passe doit contenir au moins 8 caractères, dont une majuscule, une minuscule, un chiffre et un symbole');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = 'INSERT INTO driver (username, password, phone, numT) VALUES (?, ?, ?, ?)';
    connection.query(sql, [username, hashedPassword, phone, numT], (err, result) => {
      if (err) {
        return res.status(500).send('Erreur lors de l\'insertion dans la base de données');
      }
      res.redirect('home2.html')
    });
  } catch (error) {
    res.status(500).send('Erreur lors de l\'enregistrement de l\'utilisateur: ' + error.stack);
  }
});

app.post('/client_login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Tous les champs sont obligatoires');
  }

  const sql = 'SELECT * FROM client WHERE username = ?';

  connection.query(sql, [username], async (err, results) => {
    if (err) {
      return res.status(500).send('Erreur du serveur');
    }

    if (results.length > 0) {
      const match = await bcrypt.compare(password, results[0].password);
      if (match) {
        req.session.userId = results[0].id;
        req.session.username = results[0].username;

        res.redirect('home1.html');
      } else {
        return res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
      }
    } else {
      return res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
    }
  });
});

app.post('/driver_login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send('Tous les champs sont obligatoires');
  }

  const sql = 'SELECT * FROM driver WHERE username = ?';

  connection.query(sql, [username], async (err, results) => {
    if (err) {
      return res.status(500).send('Erreur du serveur');
    }

    if (results.length > 0) {
      const match = await bcrypt.compare(password, results[0].password);
      if (match) {
        req.session.driverId = results[0].id;
        req.session.username = results[0].username;

        res.redirect('home2.html');
      } else {
        return res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
      }
    } else {
      return res.status(401).send('Nom d\'utilisateur ou mot de passe incorrect');
    }
  });
});

app.post('/reserve', (req, res) => {
  const { date, destination, lat, lon } = req.body;
  const userId = req.session.userId;

  const sql = 'SELECT username, photo FROM client WHERE id = ?';
  connection.query(sql, [userId], (err, results) => {
    if (err) {
      console.error('Erreur du serveur:', err);
      return res.status(500).send('Erreur du serveur');
    }

    if (results.length > 0) {
      const client = results[0];
      const photo = client.photo ? `data:image/jpeg;base64,${client.photo.toString('base64')}` : null;

      const data = {
        clientId: userId,
        username: client.username,
        photo: photo,
        date,
        destination,
        lat: lat,
        lon: lon
      };

      io.emit('new_reservation', data);
      res.send('Réservation envoyée aux chauffeurs');
    } else {
      res.status(404).send('Utilisateur non trouvé');
    }
  });
});


io.on('connection', (socket) => {
  console.log('Nouvelle connexion socket établie');

  socket.on('new_reservation', (data) => {
    io.emit('new_reservation', data);
  });

  socket.on('accept_reservation', (data) => {
    io.emit('accept_reservation', data);
});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Serveur en cours d'exécution sur http://localhost:${PORT}`);
});
