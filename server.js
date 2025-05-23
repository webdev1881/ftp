const express = require('express');
const ftp = require('basic-ftp');
const cors = require('cors');
const { Readable } = require('stream');
const app = express();
const port = 3001;

// Разрешаем CORS для Vue приложения
app.use(cors());
app.use(express.json());

// FTP конфигурация
const ftpConfig = {
  host: 'ftp.smkft.space',
  port: 2122,
  user: 'nielsen',
  password: 'Qazwsx32123',
  secure: false
};

// Функция для преобразования потока в строку
async function streamToString(stream) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

// Эндпоинт для получения файлов с FTP
app.post('/api/ftp/download', async (req, res) => {
  const { filePaths } = req.body;
  const client = new ftp.Client();
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  
  // Включаем отладку FTP
  client.ftp.verbose = true;
  
  try {
    console.log('Подключение к FTP...');
    await client.access(ftpConfig);
    console.log('Подключение успешно!');
    
    const results = {};
    
    for (const filePath of filePaths) {
      try {
        console.log(`Загрузка файла: ${filePath}`);
        
        // Создаем временный файл
        const tempDir = os.tmpdir();
        const tempFileName = `ftp_temp_${Date.now()}_${path.basename(filePath)}`;
        const tempPath = path.join(tempDir, tempFileName);
        
        // Загружаем файл во временную директорию
        await client.downloadTo(tempPath, filePath);
        
        // Читаем содержимое файла
        const content = await fs.readFile(tempPath, 'utf-8');
        
        // Удаляем временный файл
        await fs.unlink(tempPath);
        
        console.log(`Файл загружен: ${filePath}, размер: ${content.length} символов`);
        results[filePath] = content;
        
      } catch (error) {
        console.error(`Ошибка загрузки ${filePath}:`, error.message);
        results[filePath] = null;
      }
    }
    
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('FTP ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.close();
  }
});

// Эндпоинт для получения списка файлов
app.post('/api/ftp/list', async (req, res) => {
  const { directory } = req.body;
  const client = new ftp.Client();
  
  try {
    await client.access(ftpConfig);
    const list = await client.list(directory);
    res.json({ success: true, data: list });
  } catch (error) {
    console.error('FTP ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.close();
  }
});

// Эндпоинт для проверки существования файлов
app.post('/api/ftp/check-files', async (req, res) => {
  const client = new ftp.Client();
  
  try {
    await client.access(ftpConfig);
    
    // Получаем список всех директорий
    const directories = ['/www', '/www/receipt', '/www/cartitem'];
    const allFiles = [];
    
    for (const dir of directories) {
      try {
        const files = await client.list(dir);
        files.forEach(file => {
          allFiles.push({
            path: `${dir}/${file.name}`,
            size: file.size,
            date: file.modifiedAt
          });
        });
      } catch (err) {
        console.log(`Не удалось получить список из ${dir}`);
      }
    }
    
    res.json({ success: true, files: allFiles });
  } catch (error) {
    console.error('FTP ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.close();
  }
});

// Тестовый эндпоинт для загрузки одного файла
app.get('/api/ftp/test-download', async (req, res) => {
  const client = new ftp.Client();
  const fs = require('fs').promises;
  const path = require('path');
  const os = require('os');
  
  client.ftp.verbose = true;
  
  try {
    await client.access(ftpConfig);
    
    // Пробуем загрузить конкретный файл
    const testPath = '/www/receipt/receipt_bel_2025-02-21.csv';
    
    try {
      // Создаем временный файл
      const tempDir = os.tmpdir();
      const tempFileName = `ftp_test_${Date.now()}.csv`;
      const tempPath = path.join(tempDir, tempFileName);
      
      // Загружаем файл
      await client.downloadTo(tempPath, testPath);
      
      // Читаем содержимое
      const content = await fs.readFile(tempPath, 'utf-8');
      
      // Удаляем временный файл
      await fs.unlink(tempPath);
      
      res.json({ 
        success: true, 
        path: testPath,
        size: content.length,
        preview: content.substring(0, 200) + '...'
      });
    } catch (downloadError) {
      // Пробуем альтернативные пути
      const alternativePaths = [
        'www/receipt/receipt_bel_2025-02-21.csv',  // без начального слеша
        './www/receipt/receipt_bel_2025-02-21.csv', // с точкой
        'receipt/receipt_bel_2025-02-21.csv',      // без www
        '/receipt/receipt_bel_2025-02-21.csv'      // без www но со слешем
      ];
      
      let found = false;
      for (const altPath of alternativePaths) {
        try {
          const tempDir = os.tmpdir();
          const tempFileName = `ftp_test_alt_${Date.now()}.csv`;
          const tempPath = path.join(tempDir, tempFileName);
          
          await client.downloadTo(tempPath, altPath);
          const content = await fs.readFile(tempPath, 'utf-8');
          await fs.unlink(tempPath);
          
          res.json({ 
            success: true, 
            correctPath: altPath,
            originalPath: testPath,
            size: content.length,
            preview: content.substring(0, 200) + '...'
          });
          found = true;
          break;
        } catch (e) {
          console.log(`Путь ${altPath} не работает:`, e.message);
        }
      }
      
      if (!found) {
        res.json({ 
          success: false, 
          error: downloadError.message,
          triedPaths: alternativePaths
        });
      }
    }
    
  } catch (error) {
    console.error('FTP ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.close();
  }
});

// Альтернативный эндпоинт с использованием потоков
app.post('/api/ftp/download-stream', async (req, res) => {
  const { filePaths } = req.body;
  const client = new ftp.Client();
  
  client.ftp.verbose = true;
  
  try {
    console.log('Подключение к FTP (stream метод)...');
    await client.access(ftpConfig);
    console.log('Подключение успешно!');
    
    const results = {};
    
    for (const filePath of filePaths) {
      try {
        console.log(`Загрузка файла через поток: ${filePath}`);
        
        // Создаем поток для записи
        const chunks = [];
        const writable = new Readable({
          read() {}
        });
        
        // Собираем данные
        let content = '';
        writable.on('data', (chunk) => {
          content += chunk.toString('utf-8');
        });
        
        // Загружаем файл в поток
        await client.downloadTo(writable, filePath);
        
        console.log(`Файл загружен: ${filePath}, размер: ${content.length} символов`);
        results[filePath] = content;
        
      } catch (error) {
        console.error(`Ошибка загрузки ${filePath}:`, error.message);
        
        // Пробуем без начального слеша
        try {
          const altPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
          console.log(`Пробуем альтернативный путь: ${altPath}`);
          
          const chunks = [];
          const writable = new Readable({
            read() {}
          });
          
          let content = '';
          writable.on('data', (chunk) => {
            content += chunk.toString('utf-8');
          });
          
          await client.downloadTo(writable, altPath);
          
          console.log(`Успешно с альтернативным путем!`);
          results[filePath] = content;
        } catch (altError) {
          console.error(`Альтернативный путь тоже не работает:`, altError.message);
          results[filePath] = null;
        }
      }
    }
    
    res.json({ success: true, data: results });
  } catch (error) {
    console.error('FTP ошибка:', error);
    res.status(500).json({ success: false, error: error.message });
  } finally {
    client.close();
  }
});

app.listen(port, () => {
  console.log(`FTP сервер запущен на порту ${port}`);
});