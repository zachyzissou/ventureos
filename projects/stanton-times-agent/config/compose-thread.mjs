#!/usr/bin/env node
/**
 * Compose a Twitter/X thread from long-form content
 * Intelligently breaks content into tweets while respecting:
 * - 280 character limit per tweet
 * - Logical breakpoints (sentences, paragraphs)
 * - Context flow
 * 
 * Usage: node compose-thread.mjs "Long content here..."
 * Output: JSON array of tweets
 */

const MAX_TWEET_LENGTH = 280;
const SOFT_CAP_TWEETS = 5;
const HARD_CAP_TWEETS = 10;

function composeThread(content) {
  // If content fits in one tweet, return single tweet
  if (content.length <= MAX_TWEET_LENGTH) {
    return [content];
  }

  // Split by paragraphs first
  const paragraphs = content.split(/\n\n+/).filter(p => p.trim());
  
  const tweets = [];
  let currentTweet = '';

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    
    // If paragraph itself is too long, split by sentences
    if (trimmedParagraph.length > MAX_TWEET_LENGTH) {
      // Flush current tweet if exists
      if (currentTweet.trim()) {
        tweets.push(currentTweet.trim());
        currentTweet = '';
      }
      
      // Split long paragraph into sentences
      const sentences = trimmedParagraph.match(/[^.!?]+[.!?]+/g) || [trimmedParagraph];
      
      for (const sentence of sentences) {
        const trimmedSentence = sentence.trim();
        
        // If adding sentence exceeds limit, start new tweet
        if (currentTweet && (currentTweet + ' ' + trimmedSentence).length > MAX_TWEET_LENGTH) {
          tweets.push(currentTweet.trim());
          currentTweet = trimmedSentence;
        } else if (trimmedSentence.length > MAX_TWEET_LENGTH) {
          // Sentence itself is too long, split at word boundaries
          const words = trimmedSentence.split(' ');
          for (const word of words) {
            if (currentTweet && (currentTweet + ' ' + word).length > MAX_TWEET_LENGTH) {
              tweets.push(currentTweet.trim());
              currentTweet = word;
            } else {
              currentTweet = currentTweet ? currentTweet + ' ' + word : word;
            }
          }
        } else {
          currentTweet = currentTweet ? currentTweet + ' ' + trimmedSentence : trimmedSentence;
        }
      }
      
    } else {
      // Paragraph fits, try to add to current tweet
      if (currentTweet && (currentTweet + '\n\n' + trimmedParagraph).length > MAX_TWEET_LENGTH) {
        // Would exceed limit, start new tweet
        tweets.push(currentTweet.trim());
        currentTweet = trimmedParagraph;
      } else {
        // Add to current tweet
        currentTweet = currentTweet ? currentTweet + '\n\n' + trimmedParagraph : trimmedParagraph;
      }
    }
  }

  // Add remaining content
  if (currentTweet.trim()) {
    tweets.push(currentTweet.trim());
  }

  // Check caps
  if (tweets.length > HARD_CAP_TWEETS) {
    console.error(`⚠️  Warning: Thread exceeds hard cap (${tweets.length} > ${HARD_CAP_TWEETS})`);
    console.error('Consider condensing content or splitting into multiple threads.');
    // Truncate to hard cap
    tweets.length = HARD_CAP_TWEETS;
  } else if (tweets.length > SOFT_CAP_TWEETS) {
    console.error(`⚠️  Note: Thread exceeds soft cap (${tweets.length} > ${SOFT_CAP_TWEETS})`);
  }

  return tweets;
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const content = process.argv[2];
  
  if (!content) {
    console.error('Usage: node compose-thread.mjs "Long content here..."');
    console.error('');
    console.error('Output: JSON array of tweets');
    console.error(`Soft cap: ${SOFT_CAP_TWEETS} tweets`);
    console.error(`Hard cap: ${HARD_CAP_TWEETS} tweets`);
    process.exit(1);
  }

  const thread = composeThread(content);
  
  // Output JSON
  console.log(JSON.stringify(thread, null, 2));
  
  // Summary to stderr
  console.error(`\n✅ Composed ${thread.length} tweet${thread.length > 1 ? 's' : ''}`);
  thread.forEach((tweet, i) => {
    console.error(`   [${i + 1}/${thread.length}] ${tweet.length} chars: ${tweet.substring(0, 50)}...`);
  });
}

export { composeThread };
