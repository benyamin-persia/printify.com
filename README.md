# Printify Product Scraper

A Node.js-based web scraper that automates extraction of product and variant information from the Printify dashboard. It navigates through Printify categories, logs every workflow step in the terminal, and outputs product details along with size and price variants into a CSV file.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Running the Scraper](#running-the-scraper)
  - [Output](#output)
- [Project Structure](#project-structure)
- [Logging](#logging)
- [Contributing](#contributing)
- [License](#license)

## Features

- Automatically navigates Printify categories and paginated lists
- Extracts product names, URLs, sizes, and price variants
- Clicks through manual selection and provider info dialogs
- Appends results to `printify_products.csv` with incremental updates
- Logs every major step and error to the terminal for full traceability

## Prerequisites

- Node.js (>=14.x)
- npm (comes with Node.js)
- Windows/macOS/Linux with internet access

## Installation

1. Clone the repository or download the source:
   ```bash
   git clone https://github.com/yourusername/printify-scraper.git
   cd printify-scraper
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

## Configuration

By default, the script writes to `printify_products.csv` in the project root. You can modify the path or filename by editing the `csvPath` variable in `scraper.js`:

```js
const csvPath = path.join(__dirname, 'your_filename.csv');
```

## Usage

### Running the Scraper

```bash
node scraper.js
```

The scraper performs two main phases:

1. **Category Extraction**: Visits `https://printify.com/app/products`, iterates all categories and paginated product listings, and logs:
   - Category being processed
   - Each product discovered and its URL
   - Actions within product pages (e.g., clicking "Choose manually" and provider info dialogs)
2. **Product Processing**: Re-opens each product URL recorded in `printify_products.csv` to ensure all variant sizes and prices are captured.

### Output

All collected data is appended to `printify_products.csv` with the following columns:

| Category | Product Name | Product URL | Size | Price |
|----------|--------------|-------------|------|-------|

Duplicates are automatically skipped based on URLs already present in the CSV.

## Project Structure

```
printify-scraper/
├── scraper.js           # Main scraping script
├── package.json         # npm configuration & dependencies
├── package-lock.json    # npm lockfile
└── printify_products.csv # Output CSV (generated)
```

## Logging

All major workflow steps, clicks, pagination events, and errors are printed to the console. This ensures you can trace the scraper's progress and diagnose issues in real time.

## Contributing

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/YourFeature`).
3. Commit your changes (`git commit -m "Add new feature"`).
4. Push to the branch (`git push origin feature/YourFeature`).
5. Open a Pull Request.

Please ensure any new code is well-documented and includes error handling.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details. 