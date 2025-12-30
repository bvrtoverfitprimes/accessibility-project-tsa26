const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    firstName TEXT,
    lastName TEXT,
    nickname TEXT,
    passwordHash TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    isDeleted INTEGER DEFAULT 0,
    deletedAt DATETIME
  )`);

  db.run('ALTER TABLE users ADD COLUMN isDeleted INTEGER DEFAULT 0', () => {});
  db.run('ALTER TABLE users ADD COLUMN deletedAt DATETIME', () => {});

  const adminUsername = 'admin';
  const adminPassword = 'admin';
  db.get('SELECT id FROM users WHERE username = ?', [adminUsername], (err, row) => {
    if (err) return;
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(adminPassword, salt);
    if (!row) {
      db.run(
        `INSERT INTO users (username, firstName, lastName, nickname, passwordHash, isDeleted) VALUES (?, ?, ?, ?, ?, 0)` ,
        [adminUsername, 'Admin', '', 'Admin', hash]
      );
      return;
    }

    db.run(
      'UPDATE users SET passwordHash = ?, firstName = ?, lastName = ?, nickname = ?, isDeleted = 0, deletedAt = NULL WHERE username = ?',
      [hash, 'Admin', '', 'Admin', adminUsername]
    );
  });
});

function isAdminUsername(username) {
  return (username || '').toLowerCase() === 'admin';
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId || !req.session.isAdmin) {
    return res.status(403).send('Forbidden');
  }
  next();
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'replace_this_with_a_stronger_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // secure:true if using HTTPS
}));

app.use(express.static(path.join(__dirname)));

app.post('/signup', async (req, res) => {
  try {
    const { username, firstName, lastName, nickname, password, confirmPassword } = req.body;
    if (!username || !password || !confirmPassword) {
      return res.status(400).send('Please fill required fields.');
    }
    if (password !== confirmPassword) {
      return res.status(400).send('Passwords do not match.');
    }
    const uname = username.trim().toLowerCase();

    if (isAdminUsername(uname)) {
      return res.status(400).send('Username already taken');
    }

    db.get('SELECT id, isDeleted FROM users WHERE username = ?', [uname], (err, row) => {
      if (err) return res.status(500).send('DB error');
      if (row) {
        if (row.isDeleted === 1) return res.status(400).send('Deleted usernames cannot be re-created');
        return res.status(400).send('Username already taken');
      }

      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      db.run(
        `INSERT INTO users (username, firstName, lastName, nickname, passwordHash) VALUES (?, ?, ?, ?, ?)`,
        [uname, firstName || '', lastName || '', nickname || '', hash],
        function (err) {
          if (err) return res.status(500).send('DB insert error');
          req.session.userId = this.lastID;
          req.session.username = uname;
          req.session.isAdmin = false;
          req.session.showWelcome = true;
          return res.redirect('/html/offerings.html?welcome=1');
        }
      );
    });
  } catch (e) {
    return res.status(500).send('Server error');
  }
});

// Login handler
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).send('Missing credentials');
  const uname = username.trim().toLowerCase();

  if (isAdminUsername(uname) && String(password) === 'admin') {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('admin', salt);

    db.get('SELECT id FROM users WHERE username = ?', ['admin'], (err, row) => {
      if (err) return res.status(500).send('DB error');

      const finish = (userId) => {
        req.session.userId = userId;
        req.session.username = 'admin';
        req.session.isAdmin = true;
        req.session.showWelcome = true;
        return res.redirect('/html/admin.html');
      };

      if (!row) {
        db.run(
          `INSERT INTO users (username, firstName, lastName, nickname, passwordHash, isDeleted) VALUES (?, ?, ?, ?, ?, 0)` ,
          ['admin', 'Admin', '', 'Admin', hash],
          function (insErr) {
            if (insErr) return res.status(500).send('DB insert error');
            return finish(this.lastID);
          }
        );
        return;
      }

      db.run(
        'UPDATE users SET passwordHash = ?, firstName = ?, lastName = ?, nickname = ?, isDeleted = 0, deletedAt = NULL WHERE username = ?',
        [hash, 'Admin', '', 'Admin', 'admin'],
        (updErr) => {
          if (updErr) return res.status(500).send('DB error');
          return finish(row.id);
        }
      );
    });
    return;
  }

  db.get('SELECT * FROM users WHERE username = ? AND (isDeleted IS NULL OR isDeleted = 0)', [uname], (err, row) => {
    if (err) return res.status(500).send('DB error');
    if (!row) return res.status(400).send('Invalid username or password');
    const match = bcrypt.compareSync(password, row.passwordHash);
    if (!match) return res.status(400).send('Invalid username or password');
    req.session.userId = row.id;
    req.session.username = row.username;
    req.session.isAdmin = isAdminUsername(row.username);
    req.session.showWelcome = true;

    if (req.session.isAdmin) {
      return res.redirect('/html/admin.html');
    }
    return res.redirect('/html/offerings.html?welcome=1');
  });
});

app.get('/me', (req, res) => {
  if (!req.session.userId) return res.json({ authenticated: false });
  db.get('SELECT username, firstName, lastName, nickname FROM users WHERE id = ? AND (isDeleted IS NULL OR isDeleted = 0)', [req.session.userId], (err, row) => {
    if (err || !row) return res.json({ authenticated: false });
    const displayName = (row.nickname && row.nickname.trim()) || (row.firstName && row.firstName.trim()) || row.username;
    const showWelcome = !!req.session.showWelcome;
    delete req.session.showWelcome;
    res.json({ authenticated: true, username: row.username, displayName, showWelcome, isAdmin: !!req.session.isAdmin });
  });
});

app.get(['/html/admin.html', '/html/admin-users.html'], (req, res) => {
  if (!req.session || !req.session.userId || !req.session.isAdmin) {
    return res.redirect('/html/login.html');
  }
  return res.sendFile(path.join(__dirname, req.path));
});

app.get('/admin/users', requireAdmin, (req, res) => {
  db.all(
    'SELECT username, firstName, lastName, nickname, createdAt, isDeleted, deletedAt FROM users ORDER BY createdAt DESC',
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'DB error' });
      res.json({ users: rows || [] });
    }
  );
});

app.post('/admin/users/:username/delete', requireAdmin, (req, res) => {
  const uname = (req.params.username || '').trim().toLowerCase();
  if (!uname) return res.status(400).json({ error: 'Missing username' });
  if (isAdminUsername(uname)) return res.status(400).json({ error: 'Cannot delete admin' });

  db.run(
    'UPDATE users SET isDeleted = 1, deletedAt = CURRENT_TIMESTAMP WHERE username = ? AND (isDeleted IS NULL OR isDeleted = 0)',
    [uname],
    function (err) {
      if (err) return res.status(500).json({ error: 'DB error' });
      if (this.changes === 0) return res.status(404).json({ error: 'User not found or already deleted' });
      res.json({ ok: true });
    }
  );
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/index.html');
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});