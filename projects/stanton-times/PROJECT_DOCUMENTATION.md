# Stanton Times Content Processing System

## Project Overview
- **Name**: Stanton Times
- **Purpose**: Autonomous content monitoring and publishing system for Star Citizen news
- **Primary Channels**: Discord, Twitter
- **Core Functionality**: 
  - Monitor social media sources
  - Process and score content
  - Generate drafts
  - Facilitate human review
  - Publish approved content

## System Architecture

### Core Components
1. **Source Monitor** (`source_monitor.py`)
   - Tracks specified social media accounts
   - Identifies potential content for publication
   - Initial content scoring

2. **Content Processor** (`content_processor.py`)
   - Applies machine learning scoring
   - Generates draft content
   - Prepares content for review

3. **Discord Verification** (`discord_verifier.py`)
   - Posts content drafts to Discord channel
   - Manages review workflow
   - Handles approval/rejection reactions

4. **Tweet Publisher** (`tweet_publisher.py`)
   - Publishes approved content to Twitter
   - Manages publication timing and formatting

### Auxiliary Scripts
- `send-embed.mjs`: Discord webhook message sender
- `reaction-confirm.mjs`: Reaction workflow handler

## Monitored Sources
- RobertsSpaceInd
- starcitizenbot
- TheRubenSaurus
- CloudImperium
- squadron_42
- BoredGamerUK

## Content Scoring Mechanism
- Machine learning-based evaluation
- Scoring factors:
  - Source credibility
  - Content keywords
  - Relevance to Star Citizen community
- Threshold for review: 0.7

## Workflow
1. Source monitoring
2. Content processing
3. Draft generation
4. Discord verification
5. Conditional publication

## Configuration
- **Location**: `/projects/stanton-times/config.json`
- **Key Settings**:
  - Discord webhook URL
  - Verification channel ID
  - Content scoring thresholds
  - Monitored accounts

## Error Handling
- Retry mechanism
- Logging of failed processing attempts
- Fallback to manual review

## Deployment
- Virtual environment: `.venv`
- Run script: `run.sh`
- Dry run script: `dry_run.sh`

## Credentials Management
- Webhook URL: Stored in secured credentials file
- Authentication: Bot token-based

## Monitoring and Logging
- Logging directories:
  - `/projects/stanton-times/logs/`
- Log files:
  - `discord_bot.log`
  - `content_processing.log`
  - `tweet_publishing.log`

## Future Improvements
- Enhanced ML scoring
- Multi-source content aggregation
- Automated trend analysis

## Maintenance Notes
- Regular dependency updates
- Periodic retraining of ML model
- Monitor API changes for sources

## Last Restoration
- Date: 2026-02-02
- Context: Complete system recovery and webhook restoration

## Critical Dependencies
- Python 3.9+
- discord.py
- node-fetch
- minimist

## Potential Failure Points
1. Webhook invalidation
2. Source API changes
3. Authentication token expiration

## Backup and Recovery Strategy
- Maintain configuration in version control
- Secure credential storage
- Documented restoration procedure