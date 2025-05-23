<template>
  <div class="ftp-report-container">
    <h1>Сводная таблица по городам</h1>
    
    <!-- Панель управления -->
    <div class="control-panel">
      <div class="date-selector">
        <label>Дата начала:</label>
        <input 
          type="date" 
          v-model="startDate" 
          :max="endDate"
        />
        
        <label>Дата окончания:</label>
        <input 
          type="date" 
          v-model="endDate" 
          :min="startDate"
        />
      </div>
      
      <button 
        @click="loadData" 
        :disabled="loading"
        class="load-button"
      >
        {{ loading ? 'Загрузка...' : 'Загрузить данные' }}
      </button>
      
      <button 
        @click="checkFiles" 
        :disabled="loading"
        class="check-button"
      >
        Проверить файлы на FTP
      </button>
      
      <button 
        @click="loadDataBatch" 
        :disabled="loading"
        class="batch-button"
      >
        Загрузить данные (пакетно)
      </button>
    </div>

    <!-- Прогресс загрузки -->
    <div v-if="loading" class="progress">
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{width: progressPercent + '%'}"
        ></div>
      </div>
      <p>{{ progressText }}</p>
    </div>

    <!-- Сводная таблица -->
    <div v-if="!loading && groupedData.length > 0" class="report-table">
      <table>
        <thead>
          <tr>
            <th style="width: 30px;"></th>
            <th>Город / Магазин</th>
            <th>Количество чеков</th>
            <th>Общий оборот</th>
            <th>Средний чек</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="cityGroup in groupedData">
            <!-- Строка города с итогами -->
            <tr 
              :key="cityGroup.city + '_header'" 
              class="city-row"
              @click="toggleCity(cityGroup.city)"
            >
              <td class="expand-icon">
                <span class="toggle-icon">
                  {{ expandedCities[cityGroup.city] ? '▼' : '▶' }}
                </span>
              </td>
              <td class="city-name">
                <strong>{{ cityGroup.city }}</strong>
              </td>
              <td><strong>{{ cityGroup.totalReceipts }}</strong></td>
              <td><strong>{{ formatCurrency(cityGroup.totalRevenue) }}</strong></td>
              <td><strong>{{ formatCurrency(cityGroup.averageReceipt) }}</strong></td>
            </tr>
            
            <!-- Строки магазинов (показываются только если город развернут) -->
            <tr 
              v-for="shop in cityGroup.shops" 
              v-show="expandedCities[cityGroup.city]"
              :key="shop.id"
              class="shop-row"
            >
              <td></td>
              <td class="shop-name">{{ shop.shopName }}</td>
              <td>{{ shop.receiptCount }}</td>
              <td>{{ formatCurrency(shop.totalRevenue) }}</td>
              <td>{{ formatCurrency(shop.averageReceipt) }}</td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td><strong>Общий итог:</strong></td>
            <td><strong>{{ totalReceipts }}</strong></td>
            <td><strong>{{ formatCurrency(totalRevenue) }}</strong></td>
            <td><strong>{{ formatCurrency(averageTotal) }}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Сообщение об ошибке -->
    <div v-if="error" class="error">
      {{ error }}
    </div>
    
    <!-- Список файлов на FTP -->
    <div v-if="ftpFiles.length > 0" class="ftp-files">
      <h3>Файлы на FTP сервере:</h3>
      <ul>
        <li v-for="file in ftpFiles" :key="file.path">
          {{ file.path }} ({{ formatFileSize(file.size) }})
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import axios from 'axios';
import Papa from 'papaparse';

export default {
  name: 'FtpReportComponent',
  data() {
    return {
      startDate: '',
      endDate: '',
      loading: false,
      error: null,
      progressText: '',
      progressPercent: 0,
      reportData: [],
      cities: [
        { code: 'bel', name: 'Белая Церковь' },
        { code: 'dnepr', name: 'Днепр' },
        { code: 'kiev', name: 'Киев' },
        { code: 'khar', name: 'Харьков' }
      ],
      ftpFiles: [],
      expandedCities: {} // для отслеживания развернутых городов
    };
  },
  computed: {
    groupedData() {
      const groups = {};
      
      // Группируем данные по городам
      this.reportData.forEach(row => {
        if (!groups[row.city]) {
          groups[row.city] = {
            city: row.city,
            shops: [],
            totalReceipts: 0,
            totalRevenue: 0
          };
        }
        
        groups[row.city].shops.push(row);
        groups[row.city].totalReceipts += row.receiptCount;
        groups[row.city].totalRevenue += row.totalRevenue;
      });
      
      // Преобразуем в массив и вычисляем средний чек
      return Object.values(groups).map(group => ({
        ...group,
        averageReceipt: group.totalReceipts > 0 ? group.totalRevenue / group.totalReceipts : 0
      })).sort((a, b) => a.city.localeCompare(b.city));
    },
    totalReceipts() {
      return this.reportData.reduce((sum, row) => sum + row.receiptCount, 0);
    },
    totalRevenue() {
      return this.reportData.reduce((sum, row) => sum + row.totalRevenue, 0);
    },
    averageTotal() {
      return this.totalReceipts > 0 ? this.totalRevenue / this.totalReceipts : 0;
    }
  },
  mounted() {
    // Устанавливаем даты по умолчанию - февраль 2025
    this.endDate = '2025-02-21';
    this.startDate = '2025-02-21';
  },
  methods: {
    toggleCity(city) {
      this.$set(this.expandedCities, city, !this.expandedCities[city]);
    },
    
    formatDateForInput(date) {
      return date.toISOString().split('T')[0];
    },
    
    formatCurrency(value) {
      return new Intl.NumberFormat('ru-UA', {
        style: 'currency',
        currency: 'UAH'
      }).format(value);
    },
    
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },
    
    async loadDataBatch() {
      this.loading = true;
      this.error = null;
      this.reportData = [];
      this.progressPercent = 0;
      
      try {
        const dates = this.getDateRange();
        const allFilePaths = [];
        
        // Собираем все пути к файлам
        for (const date of dates) {
          const dateStr = this.formatDateForInput(date);
          for (const city of this.cities) {
            allFilePaths.push({
              city: city,
              date: dateStr,
              paths: [
                `/www/receipt/receipt_${city.code}_${dateStr}.csv`,
                `/www/cartitem/cartitem_${city.code}_${dateStr}.csv`,
                `/www/shop_${city.code}_${dateStr}.csv`
              ]
            });
          }
        }
        
        // Загружаем все файлы одним запросом
        this.progressText = 'Загрузка всех файлов...';
        const allPaths = allFilePaths.flatMap(item => item.paths);
        
        const response = await axios.post('http://localhost:3001/api/ftp/download-batch', {
          filePaths: allPaths
        }, {
          timeout: 600000 // 10 минут
        });
        
        if (response.data.success) {
          const allData = {
            receipts: {},
            cartItems: {},
            shops: {}
          };
          
          // Обрабатываем результаты
          for (const item of allFilePaths) {
            for (const path of item.paths) {
              const content = response.data.data[path];
              if (content) {
                const parsed = Papa.parse(content, {
                  header: true,
                  dynamicTyping: true,
                  skipEmptyLines: true
                });
                
                if (path.includes('receipt')) {
                  if (!allData.receipts[item.city.code]) allData.receipts[item.city.code] = [];
                  allData.receipts[item.city.code].push(...parsed.data);
                } else if (path.includes('cartitem')) {
                  if (!allData.cartItems[item.city.code]) allData.cartItems[item.city.code] = [];
                  allData.cartItems[item.city.code].push(...parsed.data);
                } else if (path.includes('shop')) {
                  if (!allData.shops[item.city.code]) allData.shops[item.city.code] = [];
                  allData.shops[item.city.code].push(...parsed.data);
                }
              }
            }
          }
          
          this.progressText = 'Обработка данных...';
          this.processData(allData);
        }
        
      } catch (error) {
        console.error('Ошибка загрузки:', error);
        this.error = 'Ошибка при загрузке данных: ' + error.message;
      } finally {
        this.loading = false;
      }
    },
    
    async testDownload() {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.get('http://localhost:3001/api/ftp/test-download');
        console.log('Результат теста:', response.data);
        
        if (response.data.success) {
          if (response.data.correctPath) {
            alert(`Файл найден! Правильный путь: ${response.data.correctPath}`);
          } else {
            alert(`Файл загружен успешно! Размер: ${response.data.size} байт`);
          }
        } else {
          alert(`Ошибка: ${response.data.error}\n\nПопробованные пути:\n${response.data.triedPaths.join('\n')}`);
        }
      } catch (error) {
        this.error = 'Ошибка при тестировании: ' + error.message;
      } finally {
        this.loading = false;
      }
    },
    
    async checkFiles() {
      this.loading = true;
      this.error = null;
      
      try {
        const response = await axios.post('http://localhost:3001/api/ftp/check-files');
        if (response.data.success) {
          this.ftpFiles = response.data.files;
          console.log('Найдено файлов:', this.ftpFiles.length);
          console.log('Файлы:', this.ftpFiles);
        }
      } catch (error) {
        this.error = 'Ошибка при проверке файлов: ' + error.message;
      } finally {
        this.loading = false;
      }
    },
    
    getDateRange() {
      const dates = [];
      const currentDate = new Date(this.startDate);
      const endDate = new Date(this.endDate);
      
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      return dates;
    },
    
    async loadData() {
      this.loading = true;
      this.error = null;
      this.reportData = [];
      this.progressPercent = 0;
      
      try {
        const dates = this.getDateRange();
        const totalFiles = dates.length * this.cities.length * 3; // 3 типа файлов
        let processedFiles = 0;
        
        const allData = {
          receipts: {},
          cartItems: {},
          shops: {}
        };
        
        // Загружаем данные для каждой даты и города
        for (const date of dates) {
          const dateStr = this.formatDateForInput(date);
          
          for (const city of this.cities) {
            this.progressText = `Загрузка данных для ${city.name} за ${dateStr}...`;
            
            // Формируем пути к файлам
            // Обратите внимание: файлы магазинов находятся прямо в /www/
            const filePaths = [
              `/www/receipt/receipt_${city.code}_${dateStr}.csv`,
              `/www/cartitem/cartitem_${city.code}_${dateStr}.csv`,
              `/www/shop_${city.code}_${dateStr}.csv`  // Исправлен путь
            ];
            
            console.log(`Загрузка файлов для ${city.name}:`, filePaths);
            
            // Загружаем файлы - используем обычный метод с увеличенным таймаутом
            const response = await axios.post('http://localhost:3001/api/ftp/download', {
              filePaths
            }, {
              timeout: 300000 // 5 минут таймаут
            });
            
            if (response.data.success) {
              const data = response.data.data;
              
              // Парсим CSV файлы
              for (const [path, content] of Object.entries(data)) {
                if (content) {
                  processedFiles++;
                  this.progressPercent = Math.round((processedFiles / totalFiles) * 100);
                  
                  const parsed = Papa.parse(content, {
                    header: true,
                    dynamicTyping: true,
                    skipEmptyLines: true
                  });
                  
                  if (path.includes('receipt')) {
                    if (!allData.receipts[city.code]) allData.receipts[city.code] = [];
                    allData.receipts[city.code].push(...parsed.data);
                  } else if (path.includes('cartitem')) {
                    if (!allData.cartItems[city.code]) allData.cartItems[city.code] = [];
                    allData.cartItems[city.code].push(...parsed.data);
                  } else if (path.includes('shop')) {
                    if (!allData.shops[city.code]) allData.shops[city.code] = [];
                    allData.shops[city.code].push(...parsed.data);
                  }
                } else {
                  console.warn(`Файл не найден: ${path}`);
                }
              }
            }
          }
        }
        
        // Обрабатываем загруженные данные
        this.progressText = 'Обработка данных...';
        this.processData(allData);
        
      } catch (error) {
        console.error('Ошибка загрузки:', error);
        this.error = 'Ошибка при загрузке данных: ' + error.message;
      } finally {
        this.loading = false;
      }
    },
    
    processData(allData) {
      const report = [];
      
      for (const city of this.cities) {
        const cityReceipts = allData.receipts[city.code] || [];
        const cityCartItems = allData.cartItems[city.code] || [];
        const cityShops = allData.shops[city.code] || [];
        
        // Создаем мапу магазинов
        const shopsMap = {};
        cityShops.forEach(shop => {
          shopsMap[shop.id] = shop.name || `Магазин ${shop.id}`;
        });
        
        // Создаем мапу товаров по чекам
        const itemsByReceipt = {};
        cityCartItems.forEach(item => {
          if (!itemsByReceipt[item.receipt_id]) {
            itemsByReceipt[item.receipt_id] = [];
          }
          itemsByReceipt[item.receipt_id].push(item);
        });
        
        // Группируем чеки по магазинам
        const shopData = {};
        cityReceipts.forEach(receipt => {
          const shopId = receipt.shop_id;
          if (!shopData[shopId]) {
            shopData[shopId] = {
              shopName: shopsMap[shopId] || `Магазин ${shopId}`,
              receipts: [],
              totalRevenue: 0
            };
          }
          
          // Считаем сумму чека
          const receiptItems = itemsByReceipt[receipt.id] || [];
          const receiptTotal = receiptItems.reduce((sum, item) => {
            return sum + (item.total_price || 0);
          }, 0);
          
          shopData[shopId].receipts.push(receipt);
          shopData[shopId].totalRevenue += receiptTotal;
        });
        
        // Формируем данные для отчета
        for (const [shopId, data] of Object.entries(shopData)) {
          report.push({
            id: `${city.code}_${shopId}`,
            city: city.name,
            shopName: data.shopName,
            receiptCount: data.receipts.length,
            totalRevenue: data.totalRevenue,
            averageReceipt: data.receipts.length > 0 
              ? data.totalRevenue / data.receipts.length 
              : 0
          });
        }
      }
      
      // Сортируем по городу и магазину
      this.reportData = report.sort((a, b) => {
        if (a.city !== b.city) return a.city.localeCompare(b.city);
        return a.shopName.localeCompare(b.shopName);
      });
      
      // По умолчанию все города свернуты
      this.expandedCities = {};
    }
  }
};
</script>

<style scoped>
.ftp-report-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

h1 {
  color: #333;
  margin-bottom: 30px;
}

.control-panel {
  background: #f5f5f5;
  padding: 20px;
  border-radius: 8px;
  margin-bottom: 30px;
  display: flex;
  align-items: center;
  gap: 20px;
}

.date-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.date-selector label {
  font-weight: bold;
  color: #555;
}

.date-selector input {
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.load-button {
  background: #007bff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.load-button:hover:not(:disabled) {
  background: #0056b3;
}

.load-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.check-button {
  background: #28a745;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.check-button:hover:not(:disabled) {
  background: #218838;
}

.check-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.batch-button {
  background: #6c757d;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.batch-button:hover:not(:disabled) {
  background: #5a6268;
}

.batch-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.test-button {
  background: #ffc107;
  color: #000;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  font-size: 16px;
  cursor: pointer;
  transition: background 0.3s;
}

.test-button:hover:not(:disabled) {
  background: #e0a800;
}

.test-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.ftp-files {
  background: #f8f9fa;
  padding: 15px;
  border-radius: 4px;
  margin: 20px 0;
}

.ftp-files h3 {
  margin-top: 0;
  color: #333;
}

.ftp-files ul {
  list-style: none;
  padding: 0;
}

.ftp-files li {
  padding: 5px 0;
  color: #666;
  font-family: monospace;
}

.progress {
  margin: 20px 0;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background: #f0f0f0;
  border-radius: 10px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #28a745;
  transition: width 0.3s;
}

.progress p {
  margin-top: 10px;
  color: #666;
}

.report-table {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

th, td {
  padding: 12px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

th {
  background: #f8f9fa;
  font-weight: bold;
  color: #333;
}

.city-row {
  background: #e8f0fe;
  cursor: pointer;
  transition: background 0.2s;
}

.city-row:hover {
  background: #d2e3fc;
}

.city-name {
  font-weight: bold;
  color: #1a73e8;
}

.shop-row {
  background: #fff;
}

.shop-row:hover {
  background: #f8f9fa;
}

.shop-name {
  padding-left: 30px !important;
  color: #5f6368;
}

.expand-icon {
  text-align: center;
  width: 30px;
  padding: 0 !important;
}

.toggle-icon {
  display: inline-block;
  font-size: 12px;
  color: #5f6368;
  user-select: none;
}

tr:hover {
  background: #f5f5f5;
}

tfoot td {
  background: #e9ecef;
  border-top: 2px solid #dee2e6;
}

.error {
  background: #f8d7da;
  color: #721c24;
  padding: 15px;
  border-radius: 4px;
  margin-top: 20px;
}
</style>