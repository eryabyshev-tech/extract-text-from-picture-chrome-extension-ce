console.log('Offscreen document loaded.');

let worker = null;

async function initializeWorker() {
  console.log('Starting worker initialization...');
  const workerPath = chrome.runtime.getURL('worker-overwrites.js');
  const corePath = chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'); // Убедитесь, что файл соответствует вашему
  const langPath = 'https://tessdata.projectnaptha.com/4.0.0'; // Внешний источник

  console.log('Worker path:', workerPath);
  console.log('Core path:', corePath);
  console.log('Lang path:', langPath);

  console.log('Creating worker...');
  worker = await Tesseract.createWorker({
    workerPath: workerPath,
    corePath: corePath,
    langPath: langPath,
    workerBlobURL: false,
    cacheMethod: 'none',
    errorHandler: (err) => console.error('Worker error:', err),
    logger: (m) => console.log('Worker progress:', m),
  });
  console.log('Worker created successfully.');

  const languages = 'eng+rus+deu+fra+spa';
  console.log('Loading language:', languages);
  await worker.loadLanguage(languages);
  console.log('Language loaded.');
  console.log('Initializing language:', languages);
  await worker.initialize(languages);
  console.log('Worker initialized with language:', languages);

  console.log('Sending offscreenReady message...');
  chrome.runtime.sendMessage({ type: 'offscreenReady' });
}

initializeWorker().catch((err) => console.error('Worker initialization failed:', err));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractTextFromImage') {
    const { imageDataUrl } = message;
    console.log('Received image for extraction:', imageDataUrl);
    worker.recognize(imageDataUrl).then(({ data: { text } }) => {
      console.log('Text extracted:', text);
      sendResponse({ text });
    }).catch((err) => {
      console.error('Extraction error:', err);
      sendResponse({ error: err.message });
    });
    return true;
  }
});