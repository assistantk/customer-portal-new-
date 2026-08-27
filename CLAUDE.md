# Project Commands and Guidelines

## Build & Run Commands
* **Frontend (React)**: `cd frontend && npm install`, `npm start` (or `npm run dev`)
* **Node Backend (TypeScript)**: `cd backend && npm install`, `npm run dev` (or `npm start`)
* **Java Backend (Spring Boot)**: `mvn clean install`, `mvn spring-boot:run`

## Code Style & Conventions
* **Java**: Follow standard Java and Spring Boot conventions. Use standard annotations and rely on existing exception handling (like `GlobalExceptionHandler`).
* **TypeScript / Node**: Use strict typing. Prefer `camelCase` for variables/functions and `PascalCase` for classes/interfaces. Ensure async functions use `try-catch` blocks properly.
* **React / JSX**: Use functional components with hooks. Name files using `PascalCase` for components (e.g., `CustomerRegistration.jsx`).
* **Error Handling**: Centralize errors where possible and provide meaningful error messages in HTTP responses.

## General Instructions
* Keep explanations concise and focus on providing clean, working code.
* Break down large changes into smaller, testable functions or components.
* Write meaningful commit messages if asked to commit.
* Avoid leaving dead or commented-out code.
