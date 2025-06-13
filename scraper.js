const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { parse } = require('csv-parse/sync');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper to load existing URLs from the CSV file
function loadExistingProductUrls(csvPath) {
  if (!fs.existsSync(csvPath)) return new Set();
  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parse(content, { columns: true });
  return new Set(records.map(r => r.url));
}

// Helper to append a new product to the CSV file
function appendProductToCsv(csvPath, product) {
  const line = `"${product.category.replace(/"/g, '""')}","${product.productName.replace(/"/g, '""')}","${product.url}","",""
`;
  fs.appendFileSync(csvPath, line);
}

// Helper to append a product variant (with size and price) to the CSV file
function appendVariantToCsv(csvPath, variant) {
  const line = `"${variant.category.replace(/"/g, '""')}","${variant.productName.replace(/"/g, '""')}","${variant.url}","${variant.size.replace(/"/g, '""')}","${variant.price.replace(/"/g, '""')}"
`;
  fs.appendFileSync(csvPath, line);
}

// Helper to read all product URLs from the CSV file
function readProductsFromCsv(csvPath) {
  if (!fs.existsSync(csvPath)) return [];
  const content = fs.readFileSync(csvPath, 'utf8');
  const records = parse(content, { columns: true });
  return records;
}

async function extractProductsFromPage(page) {
  // Scroll to bottom of page
  await page.evaluate(() => {
    window.scrollTo(0, document.body.scrollHeight);
  });
  await sleep(2000); // Wait for content to load

  // Extract product links and names
  const products = await page.$$eval('a.wrapper-link', links => {
    return links.map(link => {
      const href = link.getAttribute('href');
      const nameElem = link.querySelector('p[data-testid="blueprintName"]');
      const productName = nameElem ? nameElem.innerText.trim() : '';
      return {
        productName,
        url: href ? `https://printify.com${href}` : ''
      };
    });
  });

  return products;
}

async function processCategory(page, categoryUrl, categoryName, csvPath, existingUrls) {
  console.log(`\nProcessing category: ${categoryUrl}`);
  await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  let currentPage = 1;
  while (true) {
    try {
      const pageProducts = await extractProductsFromPage(page);
      for (const product of pageProducts) {
        product.category = categoryName;
        if (!existingUrls.has(product.url) && product.url) {
          console.log(`[Product] ${product.productName} -> ${product.url}`);
          appendProductToCsv(csvPath, product);
          existingUrls.add(product.url);

          // Immediately visit the product page and process it
          try {
            await page.goto(product.url, { waitUntil: 'networkidle2', timeout: 60000 });
            await sleep(2000);
            console.log(`[Visited] ${product.url}`);
            // Click 'Choose manually' button if present
            try {
              await page.waitForSelector('button[data-testid="chipButton"]', { timeout: 5000 });
              const chooseButtons = await page.$$('button[data-testid="chipButton"]');
              for (const btn of chooseButtons) {
                const text = await btn.evaluate(el => el.innerText);
                if (text.includes('Choose manually')) {
                  await btn.click();
                  console.log('Clicked "Choose manually" button');
                  await sleep(1000);
                  // After clicking 'Choose manually', click buttons inside 'custom-content'
                  await page.waitForSelector('.custom-content', { timeout: 5000 });
                  const customContentButtons = await page.$$('.custom-content button');
                  for (const btn of customContentButtons) {
                    await btn.click();
                    console.log('Clicked button inside custom-content');
                    await sleep(1000);
                  }
                  break;
                }
              }
            } catch {
              console.log('No "Choose manually" button found on product page');
            }
          } catch (err) {
            console.error(`Error visiting product page ${product.url}:`, err);
          }

          // Iterate over each Provider info button, click it, then click 'Size' and extract variants
          const providerInfoButtons = await page.$$('pfy-button[data-testid="moreDetailsButton"] button');
          console.log(`Found ${providerInfoButtons.length} 'Provider info' button(s)`);
          for (let i = 0; i < providerInfoButtons.length; i++) {
            console.log(`Clicking 'Provider info' button #${i + 1}`);
            const btn = providerInfoButtons[i];
            await btn.click();
            await sleep(1000);

            // Click 'Size' option inside custom-content if present
            const hasSize = await page.evaluate(() =>
              Array.from(document.querySelectorAll('.custom-content')).some(el => el.textContent.trim() === 'Size')
            );
            if (hasSize) {
              const clickedSizeCount = await page.evaluate(() => {
                const els = Array.from(document.querySelectorAll('.custom-content'));
                let cnt = 0;
                for (const el of els) {
                  if (el.textContent.trim() === 'Size') {
                    el.click();
                    cnt++;
                  }
                }
                return cnt;
              });
              console.log(`Clicked ${clickedSizeCount} 'Size' element(s) for provider #${i + 1}`);
            } else {
              console.log(`No 'Size' option for provider #${i + 1}`);
            }

            // Extract sizes and prices from variants table if present
            const tableExists = await page.$('pfy-variants-table[data-testid="variantsTable"]') !== null;
            if (tableExists) {
              const variants = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('pfy-variants-table-title-row'));
                return rows.map(row => {
                  const sizeEl = row.querySelector('td.selected-option pfy-variants-table-column-text [data-testid="columnText"]');
                  const priceEl = row.querySelector('span[data-testid="standardPrice"]');
                  return {
                    size: sizeEl ? sizeEl.innerText.trim() : '',
                    price: priceEl ? priceEl.textContent.trim() : ''
                  };
                });
              });
              for (const variant of variants) {
                appendVariantToCsv(csvPath, {
                  category: product.category,
                  productName: product.productName,
                  url: product.url,
                  size: variant.size,
                  price: variant.price
                });
                console.log(`[Variant] ${variant.size} -> ${variant.price} (provider #${i + 1})`);
              }
            } else {
              console.log(`No variants table for provider #${i + 1}`);
            }

            // Close the provider info popup before proceeding to the next provider
            try {
              await page.waitForSelector('i.material-icons[title="Close"]', { timeout: 3000 });
              await page.click('i.material-icons[title="Close"]');
              console.log(`Closed provider info popup for provider #${i + 1}`);
              await sleep(500);
            } catch (err) {
              console.log(`Could not close provider info popup for provider #${i + 1}:`, err);
            }
          }

          // Go back to the category page and continue
          await page.goto(categoryUrl, { waitUntil: 'networkidle2', timeout: 60000 });
          await sleep(1000);
        }
      }
      console.log(`Extracted ${pageProducts.length} products from page ${currentPage}`);
      const nextDisabled = await page.evaluate(() => {
        return !!document.querySelector('pfy-button.disabled button[disabled] pfy-icon[name="chevron_right"]');
      });
      if (nextDisabled) {
        console.log('Reached last page - next button is disabled');
        break;
      }
      const clicked = await page.evaluate(() => {
        const icons = Array.from(document.querySelectorAll('pfy-icon[name="chevron_right"]'));
        for (const icon of icons) {
          const btn = icon.closest('button');
          if (btn && !btn.disabled) {
            btn.click();
            return true;
          }
        }
        return false;
      });
      if (!clicked) {
        console.log('Could not find or click enabled next button. Stopping.');
        break;
      }
      await sleep(2000);
      currentPage++;
      console.log(`Moving to page ${currentPage}`);
    } catch (error) {
      console.error(`Error processing page ${currentPage}:`, error);
      break;
    }
  }
  console.log(`Finished processing category.`);
}

async function processProductLinks(page, csvPath) {
  const products = readProductsFromCsv(csvPath);
  for (const product of products) {
    try {
      console.log(`\nVisiting product: ${product.productName} -> ${product['Product URL']}`);
      await page.goto(product['Product URL'], { waitUntil: 'networkidle2', timeout: 60000 });
      // Wait for the page to load
      await sleep(2000);
      // Wait for the button to appear (if it does)
      try {
        await page.waitForSelector('button[data-testid="chipButton"]', { timeout: 5000 });
        const chooseManuallyBtns = await page.$$('button[data-testid="chipButton"]');
        for (const btn of chooseManuallyBtns) {
          const text = await btn.evaluate(el => el.innerText);
          if (text.includes('Choose manually')) {
            await btn.click();
            await sleep(1000);
            console.log('Clicked "Choose manually" button');
            // After clicking 'Choose manually', click buttons inside 'custom-content'
            await page.waitForSelector('.custom-content', { timeout: 5000 });
            const customContentButtons = await page.$$('.custom-content button');
            for (const btn of customContentButtons) {
              await btn.click();
              console.log('Clicked button inside custom-content');
              await sleep(1000);
            }
            break;
          }
        }
      } catch (e) {
        console.log('No "Choose manually" button found');
      }
      // Debugging log to verify reaching the point to click 'Provider info'
      console.log('Looking for "Provider info" elements inside .custom-content');
      const clickedInfoCount2 = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('.custom-content'));
        let cnt = 0;
        for (const el of els) {
          if (el.textContent.trim() === 'Provider info') {
            el.click();
            cnt++;
          }
        }
        return cnt;
      });
      console.log(`Clicked ${clickedInfoCount2} 'Provider info' element(s)`);
      await sleep(1000);
      // Wait for 'Size' option to appear and click it
      try {
        await page.waitForFunction(() =>
          Array.from(document.querySelectorAll('.custom-content')).some(el => el.textContent.trim() === 'Size'),
          { timeout: 5000 }
        );
        const clickedSizeCount2 = await page.evaluate(() => {
          const els = Array.from(document.querySelectorAll('.custom-content'));
          let cnt = 0;
          for (const el of els) {
            if (el.textContent.trim() === 'Size') {
              el.click();
              cnt++;
            }
          }
          return cnt;
        });
        console.log(`Clicked ${clickedSizeCount2} 'Size' element(s)`);
      } catch (err) {
        console.log('Size element not found or click failed:', err);
      }
      // Wait so user can see the result in the browser
      await sleep(2000);
    } catch (error) {
      console.error(`Error processing product ${product['Product URL']}:`, error);
      continue;
    }
  }
}

(async () => {
  try {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // First, get all category links
    console.log('Navigating to Printify products page...');
    await page.goto('https://printify.com/app/products', { 
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await page.waitForSelector('.nav', { timeout: 30000 });
    console.log('Navigation menu loaded');

    const categoryLinks = await page.$$eval('.nav a[href^="/app/products"]', links => {
      return links.map(link => {
        const href = link.getAttribute('href');
        const text = link.textContent.trim();
        return {
          category: text,
          url: `https://printify.com${href}`
        };
      });
    });

    const uniqueCategories = Array.from(new Map(categoryLinks.map(item => [item.url, item])).values());

    // Prepare CSV file and load existing URLs
    const csvPath = path.join(__dirname, 'printify_products.csv');
    let existingUrls = loadExistingProductUrls(csvPath);
    // Write header if file does not exist
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, 'Category,Product Name,Product URL,Size,Price\n');
    }

    // Process each category and extract products
    for (const category of uniqueCategories) {
      try {
        await processCategory(page, category.url, category.category, csvPath, existingUrls);
        console.log(`✓ Processed category: ${category.category}`);
      } catch (error) {
        console.error(`Error processing category ${category.category}:`, error);
        continue; // Continue with next category if one fails
      }
    }

    await browser.close();

    // After scraping, process each product link
    // (Re-launch browser for this step to keep the session clean)
    const browser2 = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page2 = await browser2.newPage();
    await page2.setViewport({ width: 1280, height: 800 });
    await processProductLinks(page2, csvPath);
    await browser2.close();
  } catch (error) {
    console.error('Error during scraping:', error);
  }
})();
