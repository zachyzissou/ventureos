# Stanton Times - News Monitoring System

## Project Overview
Automated news monitoring and publishing platform that aggregates content from various sources and distributes via Discord.

## Setup and Installation

### Prerequisites
- Python 3.8+
- pip
- virtualenv (recommended)

### Installation Steps
1. Clone the repository
2. Create a virtual environment:
   ```
   python3 -m venv .venv
   source .venv/bin/activate
   ```
3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

## Configuration
- Configure sources in `config/sources.json`
- Set up Discord webhook in `config/discord.json`

## Running the Project
- Source Monitoring: `python -m src.core.source_monitor`
- Discord Bot: `python -m src.core.discord_bot`

## Testing
Run tests with: `pytest tests/`

## Project Structure
- `src/`: Source code
  - `core/`: Main application logic
  - `utils/`: Utility functions
  - `content_processors/`: Content extraction and processing
- `tests/`: Test suites
- `config/`: Configuration files
- `scripts/`: Utility and deployment scripts
- `logs/`: Application logs

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request