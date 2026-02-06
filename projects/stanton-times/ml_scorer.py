import numpy as np
import os
import json
import pickle
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor

from src.config import PROJECT_ROOT, get_ml_model_path

class AdvancedContentScorer:
    def __init__(self, model_path=None):
        model_path = model_path or get_ml_model_path('content_scorer.pkl')
        self.model_path = model_path

        # Ensure model directory exists
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        # Text vectorization
        self.vectorizer = TfidfVectorizer(
            stop_words='english',
            max_features=5000,
            ngram_range=(1, 2)
        )

        # Load or train model
        if os.path.exists(model_path):
            try:
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)
            except Exception:
                # If loading fails, train a new model
                self.model = self._train_initial_model()
                self._save_model(self.model_path)
        else:
            # Train initial model if no model exists
            self.model = self._train_initial_model()
            self._save_model(self.model_path)

    def _train_initial_model(self):
        """
        Train an initial machine learning model for content scoring
        """
        # Load or create default training data
        training_data_path = str(PROJECT_ROOT / 'training_data.json')
        try:
            with open(training_data_path, 'r') as f:
                training_data = json.load(f)
        except FileNotFoundError:
            # Default training data
            training_data = {
                'texts': [
                    "Server meshing breakthrough in Star Citizen Alpha 4.6",
                    "New ship revealed at Invictus Launch Week",
                    "CitizenCon announces major gameplay updates",
                    "Minor bug fix released"
                ],
                'scores': [0.9, 0.8, 0.9, 0.3]
            }

        # Vectorize texts
        X = self.vectorizer.fit_transform(training_data['texts'])
        y = training_data['scores']

        # Train Random Forest Regressor
        model = RandomForestRegressor(n_estimators=100)
        model.fit(X, y)
        
        return model

    def _save_model(self, model_path):
        """
        Save the trained model
        """
        with open(model_path, 'wb') as f:
            pickle.dump(self.model, f)

    def score_content(self, text):
        """
        Score content using machine learning model
        """
        # Vectorize input text
        text_vector = self.vectorizer.transform([text])
        
        # Predict score
        predicted_score = self.model.predict(text_vector)[0]
        
        # Ensure score is between 0 and 1
        return float(np.clip(predicted_score, 0, 1))

    def update_model(self, new_texts, new_scores):
        """
        Incrementally update the model with new training data
        """
        # Vectorize new texts
        X_new = self.vectorizer.transform(new_texts)
        
        # Retrain model
        self.model.fit(X_new, new_scores)
        
        # Save updated model
        self._save_model(self.model_path)

def main():
    # Example usage
    scorer = AdvancedContentScorer()
    
    # Score some example texts
    texts = [
        "Server meshing breakthrough in Star Citizen Alpha 4.6",
        "Minor bug fix released",
        "New ship revealed at Invictus Launch Week"
    ]
    
    for text in texts:
        score = scorer.score_content(text)
        print(f"Text: {text}\nScore: {score}\n")

if __name__ == "__main__":
    main()