from enum import Enum, auto
from typing import Dict, Any, List, Optional

class SentimentCategory(Enum):
    """
    Enum representing different sentiment categories.
    """
    VERY_POSITIVE = auto()
    POSITIVE = auto()
    NEUTRAL = auto()
    NEGATIVE = auto()
    VERY_NEGATIVE = auto()

class SentimentResponseGenerator:
    """
    A class to generate appropriate response strategies based on sentiment analysis results.
    
    This class provides methods to interpret sentiment scores and generate 
    contextually appropriate response strategies.
    """
    
    def __init__(self, sentiment_threshold: Dict[SentimentCategory, float] = None):
        """
        Initialize the SentimentResponseGenerator.
        
        Args:
            sentiment_threshold (Dict[SentimentCategory, float], optional): 
                Custom thresholds for sentiment categorization. 
                If not provided, uses default thresholds.
        """
        self._default_thresholds = {
            SentimentCategory.VERY_NEGATIVE: -0.8,
            SentimentCategory.NEGATIVE: -0.4,
            SentimentCategory.NEUTRAL: 0.0,
            SentimentCategory.POSITIVE: 0.4,
            SentimentCategory.VERY_POSITIVE: 0.8
        }
        self.sentiment_thresholds = sentiment_threshold or self._default_thresholds
    
    def categorize_sentiment(self, sentiment_score: float) -> SentimentCategory:
        """
        Categorize a sentiment score into a specific sentiment category.
        
        Args:
            sentiment_score (float): The sentiment score to categorize.
                                     Typically ranges from -1.0 (very negative) 
                                     to 1.0 (very positive).
        
        Returns:
            SentimentCategory: The determined sentiment category.
        """
        for category, threshold in sorted(
            self.sentiment_thresholds.items(), 
            key=lambda x: x[1], 
            reverse=True
        ):
            if sentiment_score >= threshold:
                return category
        return SentimentCategory.VERY_NEGATIVE
    
    def generate_response_strategy(
        self, 
        sentiment_score: float, 
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate a response strategy based on sentiment analysis.
        
        Args:
            sentiment_score (float): The sentiment score to analyze.
            context (Dict[str, Any], optional): Additional context 
                                                for more nuanced response generation.
        
        Returns:
            Dict[str, Any]: A dictionary containing response strategy details.
                            May include recommended tone, communication approach, 
                            and specific action suggestions.
        """
        sentiment_category = self.categorize_sentiment(sentiment_score)
        
        response_strategies = {
            SentimentCategory.VERY_POSITIVE: {
                "tone": "enthusiastic",
                "communication_approach": "reinforce and celebrate",
                "action_suggestions": [
                    "express gratitude",
                    "provide positive reinforcement",
                    "explore opportunities for further engagement"
                ]
            },
            SentimentCategory.POSITIVE: {
                "tone": "supportive",
                "communication_approach": "maintain and encourage",
                "action_suggestions": [
                    "show appreciation",
                    "provide constructive feedback",
                    "offer additional support"
                ]
            },
            SentimentCategory.NEUTRAL: {
                "tone": "balanced",
                "communication_approach": "seek clarification",
                "action_suggestions": [
                    "ask open-ended questions",
                    "provide additional information",
                    "remain objective"
                ]
            },
            SentimentCategory.NEGATIVE: {
                "tone": "empathetic",
                "communication_approach": "address concerns",
                "action_suggestions": [
                    "actively listen",
                    "validate feelings",
                    "offer solutions or support"
                ]
            },
            SentimentCategory.VERY_NEGATIVE: {
                "tone": "calm and professional",
                "communication_approach": "de-escalate and resolve",
                "action_suggestions": [
                    "acknowledge serious concerns",
                    "propose concrete remediation",
                    "establish clear next steps"
                ]
            }
        }
        
        # Merge context if provided
        strategy = response_strategies[sentiment_category]
        if context:
            strategy.update({"additional_context": context})
        
        return strategy
    
    def generate_multiple_strategies(
        self, 
        sentiment_scores: List[float], 
        contexts: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate response strategies for multiple sentiment scores.
        
        Args:
            sentiment_scores (List[float]): List of sentiment scores to analyze.
            contexts (List[Dict[str, Any]], optional): Corresponding contexts 
                                                       for each sentiment score.
        
        Returns:
            List[Dict[str, Any]]: A list of response strategies.
        """
        # If no contexts provided, use None for each sentiment score
        if contexts is None:
            contexts = [None] * len(sentiment_scores)
        
        # Ensure contexts list matches sentiment_scores length
        if len(contexts) != len(sentiment_scores):
            raise ValueError("Number of contexts must match number of sentiment scores")
        
        return [
            self.generate_response_strategy(score, context)
            for score, context in zip(sentiment_scores, contexts)
        ]