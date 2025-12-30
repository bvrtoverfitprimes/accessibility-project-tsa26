# Accessibility Interface — Local Server

This project includes a simple Node.js server for local development with a lightweight SQLite user store.

## Install

1. Ensure Node.js is installed.
2. From the project root run:

```bash
npm install
```

## Run

```bash
npm start
```

Server will run on http://localhost:3000. The app serves the static files and provides endpoints:
- `POST /signup` — creates a user (redirects to offerings on success)
- `POST /login` — logs in a user (redirects to offerings on success)

User data is stored in `users.db` in the project root (SQLite). This is for local development and testing only.
