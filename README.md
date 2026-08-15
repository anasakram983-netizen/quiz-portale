# 🎯 QuizPortal — Secure Full-Stack Online Quiz Application

A production-ready, secure, and interactive online quiz platform built with Node.js, Express, REST API, SQLite, JWT Authentication, Bcrypt password hashing, XSS sanitization, and server-side anti-cheat quiz grading.

---

## 🛡️ Security Features Overview

1. **Database Migration**: Replaced insecure client-side `localStorage` data storage with a Node.js/Express REST API and SQLite database.
2. **JWT & Bcrypt Authentication**:
   - Passwords hashed with `bcryptjs` (salt rounds = 10).
   - Signed JSON Web Tokens (JWT) for session management with automatic expiration.
   - Strict role-based middleware (`requireRole('admin')`) enforcing server-side API authorization. Direct URL bypass attempts are blocked on both frontend and backend.
3. **Anti-Cheat Grading Engine**:
   - Questions sent to students during active quiz sessions (`GET /api/quizzes/:id/session`) **omit correct options and explanations**.
   - Answers are evaluated server-side upon submission (`POST /api/quizzes/:id/submit`).
   - Attempt count limits and timing boundaries are strictly enforced by the server.
4. **Input Sanitization**:
   - Sanitizes user input across registration, quiz builder, and CSV bulk imports to prevent Cross-Site Scripting (XSS) attacks.

---

## 🚀 Local Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```env
PORT=5000
JWT_SECRET=your_custom_jwt_secret_key_2026!
NODE_ENV=development
CLIENT_ORIGIN=*
```

### 3. Start Backend Server
```bash
npm start
```
The server will start at `http://localhost:5000` and automatically seed initial data:
- **Admin**: `admin@quiz.com` / `admin123`
- **Student**: `ali@student.com` / `ali123`

---

## 🌐 Deployment & Publishing Guide

### Option 1: 1-Click Unified Server Deployment (Render / Railway)

#### Deploying on Render:
1. Push your repository to GitHub / GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/) and click **New > Web Service**.
3. Connect your GitHub repository.
4. Set Build & Start settings:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
5. In **Environment Variables**, add:
   - `JWT_SECRET` = `a_strong_random_secret_string`
   - `NODE_ENV` = `production`
6. Click **Create Web Service**. Render will build and deploy your app with **automatic free HTTPS SSL**.

#### Deploying on Railway:
1. Go to [Railway.app](https://railway.app/) and create a **New Project**.
2. Select **Deploy from GitHub repo**.
3. Add environment variable `JWT_SECRET` in Railway project settings.
4. Railway will automatically detect `package.json` and start the server with SSL enabled.

---

### Option 2: Decoupled Deployment (Vercel Frontend + Render API)

#### 1. Backend (Render / Railway):
Deploy the Node.js server as described above. Take note of your API URL (e.g. `https://quizportal-api.onrender.com`).

#### 2. Frontend (Vercel):
1. Install Vercel CLI or import repository at [vercel.com](https://vercel.com).
2. Set environment variable or update `API_BASE` in `js/api.js` to point to your live backend domain.
3. Deploy with:
   ```bash
   vercel --prod
   ```

---

## 🔒 Custom Domain & HTTPS Setup

1. In Render, Railway, or Vercel, navigate to **Settings > Custom Domains**.
2. Add your custom domain (e.g., `quiz.yourdomain.com`).
3. Add the required CNAME / A DNS records at your domain registrar (Cloudflare, Namecheap, GoDaddy).
4. SSL Certificates will be issued **automatically via Let's Encrypt** with full HTTPS enforcement.
