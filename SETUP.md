git clone https://github.com/BitGhost81/InterviewShield.git

:: Create MySQL database first
	CREATE DATABASE interviewshield;

:: Configure database
	setx DB_URL "jdbc:mysql://localhost:3306/interviewshield"
	setx DB_USER "root"
	setx DB_PASSWORD "YOUR_MYSQL_PASSWORD"

:: Frontend
	cd app
	npm install
	npm run dev
