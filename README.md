# GovernTogether 🏛️

> A civic complaint system and governance platform that empowers citizens to report local issues, tracks departmental responses, and maintains a performance index for villages.

## 🚀 Overview

GovernTogether is a modern, full-stack web application designed to bridge the gap between citizens and local governance. It allows users to register, report civic issues with image evidence, and track the status of their complaints. The system incorporates AI-powered validation to filter out fake complaints and maintain high governance standards using an automated performance scoring system.

## 💻 Tech Stack

### Frontend
- **React.js (Vite)**
- **React Router** (Navigation)
- **Axios** (API Requests)
- **Lucide React** (Icons)
- **Swiper** (Carousels/Sliders)
- **JWT Decode** (Token decoding)

### Backend
- **Node.js & Express.js**
- **PostgreSQL (NeonDB)** (Database)
- **Google Gemini AI** (Spam detection & image validation)
- **Cloudinary** (Image hosting)
- **Nodemailer** (OTP & Email notifications)
- **node-cron** (Automated scheduled tasks & penalties)
- **bcrypt & jsonwebtoken** (Authentication & Security)

## 🏗️ System Architecture

```text
+-------------------+       REST API        +-------------------+
|                   |   (JSON over HTTP)    |                   |
|   Frontend (UI)   | <-------------------> |  Backend (Server) |
|   React + Vite    |                       | Express + Node.js |
|                   |                       |                   |
+-------------------+                       +---------+---------+
                                                      |
                                                      |
                                            +---------v---------+
                                            |    Database       |
                                            |  Neon PostgreSQL  |
                                            +---------+---------+
                                                      |
                                            +---------v---------+
                                            | External Services |
                                            | - Gemini AI       |
                                            | - Cloudinary      |
                                            | - SMTP/Ethereal   |
                                            +-------------------+
```

## 📁 Project Folder Structure

```
GovernTogether/
├── backend/
│   ├── .env                 # Environment variables
│   ├── server.js            # Main Express application
│   ├── database.js          # Database connection & queries
│   ├── package.json         # Backend dependencies
│   └── uploads/             # Local fallback for image uploads
└── frontend/
    ├── public/              # Static assets
    ├── src/                 # React source code
    ├── package.json         # Frontend dependencies
    └── vite.config.js       # Vite configuration
```

## 🛠️ Installation & Setup

### Prerequisites
- Node.js (v16+)
- PostgreSQL (or access to NeonDB)
- Cloudinary Account (for image uploads)
- Google Gemini API Key

### 1. Clone the repository
```bash
git clone https://github.com/yourusername/GovernTogether.git
cd GovernTogether
```

### 2. Backend Setup
```bash
cd backend
npm install
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

## 🔐 Environment Variables

Create a `.env` file in the `backend/` directory using the following format:

```env
# Server
PORT=5000
JWT_SECRET=your_jwt_secret_key

# Database
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Email (Nodemailer)
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Cloudinary (Image Uploads)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# AI Integration
GEMINI_API_KEY=your_google_gemini_api_key
```

## 🏃‍♂️ How to Run

1. **Start the Backend Server**
```bash
cd backend
npm start
# OR using nodemon for development
# npm run dev
```

2. **Start the Frontend Development Server**
```bash
cd frontend
npm run dev
```
The frontend will typically run on `http://localhost:5173/` and the backend on `http://localhost:5000/`.

## 🌐 API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new citizen
- `POST /api/auth/login` - Login (Citizen/Host/Admin)
- `POST /api/auth/verify-otp` - Verify email OTP
- `POST /api/auth/forgot-password` - Request password reset OTP
- `POST /api/auth/reset-password` - Reset password

### Complaints
- `POST /api/complaints` - Submit a new civic complaint
- `GET /api/complaints` - Fetch complaints (Filtered by role)
- `POST /api/complaints/:id/status` - Update complaint status (Resolved/Closed/etc.)

### Locations & Departments
- `GET /api/locations/states` - List states
- `GET /api/locations/states/:id/districts` - List districts by state
- `GET /api/locations/districts/:id/mandals` - List mandals by district
- `GET /api/locations/mandals/:id/villages` - List villages by mandal
- `GET /api/villages/:id` - Get specific village details (Performance Index)
- `GET /api/departments` - List civic departments & subcategories

## 📸 Screenshots

*(Replace these placeholders with actual screenshots of your application)*

| Dashboard | File a Complaint |
| :---: | :---: |
| ![Dashboard](https://via.placeholder.com/400x250?text=Dashboard+Screenshot) | ![File Complaint](https://via.placeholder.com/400x250?text=Complaint+Form+Screenshot) |
| **Login / Registration** | **Complaint Tracking** |
| ![Auth](https://via.placeholder.com/400x250?text=Auth+Screenshot) | ![Tracking](https://via.placeholder.com/400x250?text=Tracking+Screenshot) |

## 🚀 Deployment

- **Frontend**: Can be deployed on Vercel, Netlify, or Firebase Hosting.
- **Backend**: Can be deployed on Render, Railway, or Heroku.
- **Database**: Recommended to use NeonDB or Supabase.

## 🔮 Future Enhancements
- 📱 Mobile App (React Native) integration
- 📊 Advanced Analytics Dashboard for Admins
- 🌐 Multi-language support for regional accessibility
- 🔔 Push notifications for complaint updates

## 🤝 Contributors
- **[Your Name]** - *Full Stack Developer* - [GitHub Profile](https://github.com/yourusername)

## 📄 License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
