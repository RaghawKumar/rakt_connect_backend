# RaktSetu (Blood Bridge) Backend API

This is the backend server for **RaktSetu**, built using **Node.js + Express** and a **MySQL** database. It implements unified OTP-based authentication, user profile management for three roles, location-based blood request generation/matching, and real-time blood stock management for blood banks.

## Features

- 🔑 **Unified OTP Authentication**: Passwordless OTP flow for Donors, Recipients, and Hospital/Blood Banks.
- 👤 **Role-Based Profiles**: Structured profile updates supporting blood group, age, gender, coordinates, last donation date, and emergency contacts.
- 🩸 **Proximity-Based Requests**: Donors can query nearby blood requests within 10 km (calculating distance in real-time via SQL Haversine calculations).
- 🏥 **Blood Bank Inventory**: Hospitals and blood banks can update their stock. Donors/recipients can find nearby blood banks with real-time stock lists.
- ⚙️ **Auto-Initializing Schema**: The database connection automatically detects, creates, and seeds the tables on startup.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.0.0 or higher recommended)
- [MySQL Server](https://www.mysql.com/)

### Installation

1. Install npm dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory (based on `.env.example`):
   ```ini
   PORT=5000
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=raktconnect_db
   JWT_SECRET=supersecretjwtkeyforraktsetuapp2026
   NODE_ENV=development
   ```

3. Ensure your MySQL server is running. You do not need to manually import any SQL file; the application automatically creates the database and sets up the tables upon startup!

### Running the Server

- Run in development mode (with hot reloading via nodemon):
  ```bash
  npm run dev
  ```

- Start in production mode:
  ```bash
  npm start
  ```

---

## API Endpoints List

### 1. Authentication APIs (`/api/auth`)
* `POST /send-otp`: Sends a mock 6-digit OTP code (printed to server console and returned in response during development).
  * *Request Body:* `{ "phone_number": "+91 98765 43210", "role": "donor" }`
* `POST /verify-otp`: Verifies the OTP and returns a JWT token.
  * *Request Body:* `{ "phone_number": "+91 98765 43210", "role": "donor", "otp_code": "582914" }`
  * *Response:* Includes `token`, `isProfileCompleted` status, and `user` profile info.

### 2. User Profile APIs (`/api/users`)
*All endpoints require `Authorization: Bearer <token>`*
* `GET /profile`: Get details of the logged-in user profile.
* `PUT /profile`: Complete or update the profile (marks profile as completed).
  * *Request Body:*
    ```json
    {
      "full_name": "Raghav Sharma",
      "blood_group": "O+",
      "age": 28,
      "gender": "Male",
      "location_name": "Lanka, Varanasi, UP",
      "latitude": 25.2785,
      "longitude": 82.9982,
      "last_donation_date": "12 May 2026",
      "emergency_contact": "+91 99887 70011"
    }
    ```

### 3. Blood Requests APIs (`/api/blood-requests`)
*All endpoints require `Authorization: Bearer <token>`*
* `POST /`: Raises a new blood request (available for Recipients and Hospitals).
  * *Request Body:*
    ```json
    {
      "patient_name": "Ravi Kumar",
      "blood_group": "O+",
      "units_required": 3,
      "hospital_name": "AIIMS Hospital",
      "location_name": "AIIMS, Delhi",
      "latitude": 28.5672,
      "longitude": 77.2100,
      "is_emergency": true
    }
    ```
* `GET /`: Lists requests.
  * *For Donors:* Lists active requests sorted by proximity (using query parameters `?latitude=XX&longitude=YY&radius=10`).
  * *For Recipients:* Lists all historical blood requests created by the user with their respective status and response counts.
* `POST /:id/respond`: Express interest in donating (Donors only).
* `PUT /:id/status`: Update status of a request (Owner only).
  * *Request Body:* `{ "status": "completed" }` (or `cancelled`, `active`)
* `GET /:id/responses`: Retrieves the contact list of donors who responded to a specific request (Owner only).

### 4. Stock Management APIs (`/api/stocks`)
*All endpoints require `Authorization: Bearer <token>`*
* `GET /`: Retrieve the current stock of all 8 blood groups (Hospitals/Blood Banks only).
* `PUT /`: Update blood stock (Hospitals/Blood Banks only).
  * *Request Body (Bulk):*
    ```json
    {
      "stocks": [
        { "blood_group": "O+", "units_in_stock": 25 },
        { "blood_group": "A+", "units_in_stock": 10 }
      ]
    }
    ```
* `GET /nearby`: Queries nearby blood banks, their distance, and lists which blood groups are currently "in stock" (Donors & Recipients).
  * *Query Params:* `?latitude=XX&longitude=YY&radius=15`

---

## Running Verification Tests

To verify the database, server, authentication flow, and calculations, you can run the end-to-end automated test script:

```bash
node test_api.js
```

This test script boots the server programmatically, makes real HTTP requests simulating multiple user types, triggers a matching workflow, and prints the result.
