# That’s My Duo – Rift Rewind Hackathon 2025  

## 🧩 Overview

**That’s My Duo** is a League of Legends companion that shows how you and your friends play together. It analyzes match history and generates fun AI-powered summaries about your duo’s synergy, performance, and playstyle.  

## ⚙️ Architecture  

### Frontend (Angular)

- Home screen + form to enter summoner name, tagline, and region  
- Displays player profile and early duo overview  
- **Current:** Riot API data integrated but needs cleaning and structure  

### Backend (Express.js)

- Core API and Riot data handling  
- Endpoints for summoner data and duo analysis  
- **Current:** Basic fetch works, logic for meaningful insights still missing  

### AI Integration (AWS Bedrock)

- Planned for generating duo recaps and narrative insights  
- **Status:** Not implemented yet  

## 🚧 Current Focus

- Improve data quality and usefulness from Riot API  
- Implement duo analysis logic  
- Integrate AI recap generation  
