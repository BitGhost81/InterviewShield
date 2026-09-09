# InterviewShield — Team Setup

Follow these steps in order.

## 1. Clone the Repository

Open PowerShell and run:

```powershell
git clone https://github.com/BitGhost81/InterviewShield.git
cd InterviewSheild
```

## 2. Install Frontend Dependencies

```powershell
cd app
npm install
```

## 3. Install mkcert

```powershell
winget install FiloSottile.mkcert
```

Close PowerShell and open it again.

## 4. Install the Local Certificate Authority

```powershell
mkcert -install
```

## 5. Find Your Computer's IP Address

```powershell
ipconfig
```

Find your `IPv4 Address`.

Example:

```
192.168.1.25
```

Use your own IP address in the commands below.

## 6. Generate the HTTPS Certificate

Make sure you are inside the `app` folder:

```powershell
cd app
```

Generate the certificate:

```powershell
mkcert YOUR_IP localhost 127.0.0.1
```

Example:

```powershell
mkcert 192.168.1.25 localhost 127.0.0.1
```

## 7. Configure Frontend Environment Variables

Replace `YOUR_IP` with your IPv4 address:

```powershell
setx VITE_REALTIME_URL "wss://YOUR_IP:1234"
setx VITE_API_URL "/api"
```

Example:

```powershell
setx VITE_REALTIME_URL "wss://192.168.1.25:1234"
setx VITE_API_URL "/api"
```

Close PowerShell and open it again after running these commands.

## 8. Configure Database Environment Variables

Set the MySQL database credentials used by the Spring Boot backend:

```powershell
setx DB_URL "jdbc:mysql://localhost:3306/InterviewShield"
setx DB_USER "YOUR_MYSQL_USERNAME"
setx DB_PASSWORD "YOUR_MYSQL_PASSWORD"
```

Example:

```powershell
setx DB_URL "jdbc:mysql://localhost:3306/InterviewShield"
setx DB_USER "root"
setx DB_PASSWORD "yourpassword"
```

Close PowerShell and open it again after running these commands.

## 9. Create the Database

Open MySQL and create the database:

```sql
CREATE DATABASE InterviewShield;
```

## 10. Start the Backend

Open Terminal 1.

From the project root:

```powershell
cd backend
mvn spring-boot:run
```

Keep this terminal running.

## 11. Start the Realtime Server

Open Terminal 2:

```powershell
cd app
npm run realtime
```

Keep this terminal running.

## 12. Start the Frontend

Open Terminal 3:

```powershell
cd app
npm run dev -- --host
```

Keep this terminal running.

## 13. Open the Application

Vite will display a Network URL similar to:

```
Network: https://192.168.1.25:5173/
```

Open that URL in your browser.

## Important

Do NOT edit IP addresses inside the React source code.

Each team member only needs to use their own IP address for:

* HTTPS certificate generation
* `VITE_REALTIME_URL`

Each team member should also use their own MySQL username and password for:

* `DB_USER`
* `DB_PASSWORD`
