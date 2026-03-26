# Brainstorming Summary: file_classifier

## 1. Project Overview
- **Name:** file_classifier
- **Objective:** Deeply analyze diverse Italian legal documents (e.g., PDFs, physical scans, emails) to accurately extract the **Date** and precisely determine the **Document Label** (e.g., "mutuo", "lettera di ingiunzione").

## 2. Core Mechanics & Architecture
- **Interface:** A Web Application Interface (Web UI).
- **Feedback Loop:** The UI is crucial for an active learning loop. Users will upload files, view the system's extracted data alongside the document, and manually correct errors. These corrections will be fed back into the machine learning pipeline to continuously enhance precision.

## 3. Constraints & Preferences
- **Language Stack:** Italian legal NLP domain.
- **Privacy & Hosting:** The system prioritizes local, open-source, offline solutions for maximum privacy. However, it is explicitly authorized to fall back to secure, private cloud services/APIs if the local models lack sufficient accuracy for the complex Italian legal domain.
