# Framework Creation Script

This script processes a CSV file (`fw-c-t.csv`) to create frameworks, master categories, categories, terms, term associations, and finally publish the frameworks via API calls.

## Prerequisites

- Python 3.x
- `requests` library (install with `pip install requests`)
- CSV file `fw-c-t.csv` in the same directory
- `config.json` with API credentials

## Configuration

Update `config.json` with your actual values:

```json
{
    "host": "https://your-api-host.com",
    "apikey": "your-api-key",
    "channel_id": "your-channel-id"
}
```

## CSV File Structure

The CSV should have the following columns:

- Code areas of competence
- Areas of expertise
- Competence code
- Skills
- Code under jurisdiction
- Under skills
- Code Observable Elements
- Observable elements

## Steps to Run

You can run individual steps or all steps. Add `--dry-run` to print requests without sending.

### Setup Frameworks and Categories

Creates frameworks, master categories, and categories for each framework.

```bash
python create_frameworks.py --step setup --dry-run
```

Or without dry-run:

```bash
python create_frameworks.py --step setup
```

### Create Terms

Creates terms for each category from the CSV data and saves term IDs.

```bash
python create_frameworks.py --step terms --dry-run
```

Or:

```bash
python create_frameworks.py --step terms
```

### Establish Term Associations

Updates associations between terms hierarchically.

```bash
python create_frameworks.py --step associations --dry-run
```

Or:

```bash
python create_frameworks.py --step associations
```

### Publish Frameworks

Publishes each framework after all terms and associations are in place.

```bash
python create_frameworks.py --step publish --dry-run
```

Or:

```bash
python create_frameworks.py --step publish
```

### Run Complete Process (includes publish)

Runs all steps sequentially.

```bash
python create_frameworks.py --step all --dry-run
```

Or:

```bash
python create_frameworks.py --step all
```

- `--dry-run`: Optional flag that prints all requests without sending them (useful for testing).
- Run steps in order: setup, then terms, then associations (or use `all`).

## What Each Step Does

1. **Setup**: Creates frameworks based on unique codes, master categories (Domain, Skill, SubSkill, ObservableElement), and categories for each framework.
2. **Terms**: Creates terms for each category from CSV rows, saves term IDs to `term_ids.json`.
3. **Associations**: Updates term associations hierarchically (Domain → Skills → SubSkills → ObservableElements) using saved term IDs.
4. **Publish**: Calls the publish endpoint for every framework.
5. **All**: Runs all steps sequentially.

## Notes

- Use `--dry-run` first to validate payloads.
- Avoid duplicate creation: script tracks what was already created in-memory per run.
- Framework codes with trailing numbers get normalized (e.g. DC1 → DC_1).
- Check `term_ids.json` after the terms step if troubleshooting associations.

## Troubleshooting

- No terms created: ensure you ran `--step setup` first so frameworks & categories exist (unless dry-run).
- Missing associations: confirm `term_ids.json` has entries and CSV column names match exactly.
- 404 on update: verify the base node_id (without prefixed category) is used—handled automatically by the script.
- Enable debug logs by setting the logging level (modify script or run with an environment variable if added).
