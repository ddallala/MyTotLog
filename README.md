# MyTotLog

This is an Ionic/Angular application to track a newborn's daily activities, including feedings, poops, and pees, with Firebase as the backend and Firebase Hosting for deployment.

## Getting Started

### Prerequisites

Ensure you have the following tools installed before proceeding:

- **Node.js**: [Install Node.js](https://nodejs.org/)
- **Ionic CLI**: To install the Ionic CLI globally:
  
  ```bash
  npm install -g @ionic/cli
  ```

### Clone the Repository

Clone the repository to your local machine:

```bash
git clone https://github.com/ddallala/https://github.com/ddallala/MyTotLog.git
cd MyTotLog
```

### Install Dependencies in both root and functions

Install all required dependencies:

```bash
npm install
```

```bash
cd functions
npm install
```

### Create the environment files (see src/environments/environment.example.ts)
```bash
cp src/environments/environment.example.ts src/environments/environment.prod.ts
cp src/environments/environment.example.ts src/environments/environment.ts
```
And update with your own firebase configuration settings.
Update the prod file to: production: true

### Running the Application

To serve the application locally:

```bash
ionic serve
```

This will start the development server and open the app in your default web browser.

### Firebase Setup for hosting and functions

1. **Install Firebase CLI**: Ensure you have the Firebase CLI installed globally:

   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**: Log in to your Firebase account:

   ```bash
   firebase login
   ```

3. A. **Initialize New Firebase**: Run Firebase initialization in your project folder. This will set up Firebase Hosting and Firestore:

   ```bash
   firebase init
   ```

   Follow the prompts and select the following:
   - Choose your Firebase project.
   - Select **Hosting** (configure files for Firebase Hosting).
   - Set the public directory to `www`.
   - Choose "Yes" for single-page app configuration.

3. B. **Use Existing Firebase**: Run Firebase initialization in your project folder. This will set up Firebase Hosting and Firestore:

   ```bash
   firebase projects:list
   firebase use --add <project-id>
   ```
   
### Building the Application for Production

To build the application for production, run:

```bash
ionic build --prod
```

This will compile the app into static files inside the `www` directory.

### Deploying to Firebase Hosting

Deploy the built files to Firebase Hosting:

```bash
firebase deploy
```

```bash
firebase deploy --only functions
```

Don't forget to set the keys on firebase:
```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GOOGLE_API_KEY

firebase functions:secrets:set LANGCHAIN_TRACING_V2
firebase functions:secrets:set LANGCHAIN_ENDPOINT
firebase functions:secrets:set LANGCHAIN_API_KEY
firebase functions:secrets:set LANGCHAIN_PROJECT

firebase functions:secrets:access LANGCHAIN_API_KEY
```

After a successful deployment, Firebase will provide a hosting URL where your app is live.

## Additional Resources

- [Ionic Documentation](https://ionicframework.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
