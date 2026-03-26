# Open Source NLP for Italian Legal Document Classification

Based on preliminary research, here are the most promising open-source tools and datasets for the `file_classifier` project:

## 1. ITALIAN-LEGAL-BERT
- **Description:** A Transformer Language Model specifically developed for Italian Law. Built on `bert-base-italian-xxl-cased` and pre-trained on Italian civil law corpora.
- **Why it matters:** It achieves superior results in domain-specific tasks compared to general-purpose Italian models. Highly suitable for classifying "mutuo", "lettera di ingiunzione", etc.
- **Availability:** Hugging Face (`dlicari/Italian-Legal-BERT`).

## 2. SmartPA - Document Classifier
- **Description:** An open-source Artificial Intelligence project aimed at enhancing document archiving in accordance with Italian legal requirements. 
- **License:** EUPL-1.2.
- **Why it matters:** Provides an out-of-the-box framework that might already have the exact document taxonomy needed for Italian public/legal administration.

## 3. ItaliaNLP Lab & Tint
- **Description:** Foundational NLP tools for Italian (tokenization, POS tagging, dependency parsing). MELT (Metadata Extraction from Legal Texts) from FBK is specifically designed for automatic consolidation of legal texts.
- **Why it matters:** If the primary BERT models fail at specific metadata extraction (like finding complexly formatted dates), falling back to syntactic dependency parsing with Tint might be required.

## 4. Fine-Tuning Strategy (Human in the loop)
Since the `file_classifier` architecture relies on a Web UI for explicit user feedback, the backend can be designed to periodically fine-tune the classification head of `Italian-Legal-BERT` using the corrected labels.
