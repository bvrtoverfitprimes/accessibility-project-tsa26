# accessibility-project-tsa26

TSA 2025–2026 project developing a cross-platform accessibility platform for users with vision and hearing disabilities. Features include real-time captions, audio descriptions, device integration, personalization, and privacy-first local processing.

## Local development

This project includes a simple Node.js server for local development with a lightweight SQLite user store.

### Install

1. Ensure Node.js is installed.
2. From the project root run:

```bash
npm install
```

### Run

```bash
npm start
```

Server will run on http://localhost:3000.

The app serves static files and provides endpoints:
- `POST /signup` — creates a user (redirects to offerings on success)
- `POST /login` — logs in a user (redirects to offerings on success)

User data is stored in `users.db` in the project root (SQLite). This file is ignored by git and is intended for local development/testing only.
