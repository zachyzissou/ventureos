class TweetStyleGuide:
    def __init__(self):
        self.power_words = {
            'replacements': {
                'Available': 'Live',
                'Currently': 'Now',
                'Announced': 'Confirmed',
                'Reports indicate': 'Sources say',
                'Plans to': 'Targets'
            },
            'avoid': [
                'Exciting', 'Amazing', 'Huge', 'Insane', 'Literally'
            ]
        }
        
        self.templates = {
            'breaking_news': "⚡ BREAKING: {headline}\n\n{details}\n\n🔗 {source}\n\n#StarCitizen",
            'patch_notes': "🔧 {version} PATCH NOTES: The Big Stuff\n\n{points}\nFull breakdown: {link}\n\nWhat's your priority? ⬇️\n\n#StarCitizen #PatchNotes",
            'event_coverage': "📡 {event_name} Day {day}: What You Missed\n\n{key_points}\n\n{link}\n\n#StarCitizen #{event_hashtag}"
        }

    def clean_text(self, text):
        """
        Apply style guide cleaning to text
        """
        # Replace specified words
        for old, new in self.power_words['replacements'].items():
            text = text.replace(old, new)
        
        # Remove avoided words
        for word in self.power_words['avoid']:
            text = text.replace(word, '')
        
        return text.strip()

    def generate_tweet(self, content_type, **kwargs):
        """
        Generate a tweet based on predefined templates
        """
        if content_type not in self.templates:
            raise ValueError(f"No template for {content_type}")
        
        # Clean and prepare template
        template = self.templates[content_type]
        
        # Fill in template with provided kwargs
        try:
            tweet = template.format(**kwargs)
        except KeyError as e:
            raise ValueError(f"Missing required parameter for {content_type}: {e}")
        
        return self.clean_text(tweet)

    def suggest_hashtags(self, content):
        """
        Suggest relevant hashtags based on content
        """
        hashtag_map = {
            'patch': ['#StarCitizen', '#PatchNotes'],
            'server': ['#StarCitizen', '#ServerTech'],
            'event': ['#StarCitizen', '#CommunityEvent'],
            'ship': ['#StarCitizen', '#SpaceShip']
        }
        
        # Detect content type and return appropriate hashtags
        content_lower = content.lower()
        for key, tags in hashtag_map.items():
            if key in content_lower:
                return tags
        
        return ['#StarCitizen']

def main():
    # Example usage
    style_guide = TweetStyleGuide()
    
    # Breaking news example
    breaking_tweet = style_guide.generate_tweet(
        'breaking_news',
        headline='Alpha 4.6 Deploys with Zero Downtime',
        details='Server meshing infrastructure handled the update seamlessly—a first for CIG.',
        source='robertsspaceindustries.com/comm-link'
    )
    print(breaking_tweet)

if __name__ == "__main__":
    main()