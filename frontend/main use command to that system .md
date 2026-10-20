# development branch එකට යන්න
git checkout development

# latest changes ගන්න
git pull origin development

# feature branch එක create කරන්න
git checkout -b feature-login

# files stage කරන්න
git add .

# commit
git commit -m "Implement login page"

# push
git push -u origin feature-login

///////////////////////////////////////////////////////////////////////////////////////////
#start project 
# goto backend 
cd backend
# startvirtual machine
.\Venv\Scripts\Activate
# start project 
python manage.py runserver

# start frontend
cd frontend

# npm start
npm run dev