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
      
      <!-- <button 
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
      </button> -->
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
                <div>{{ cityGroup.city }}</div>
              </td>
              <td><div>{{ cityGroup.totalReceipts }}</div></td>
              <td><div>{{ formatCurrency(cityGroup.totalRevenue) }}</div></td>
              <td><div>{{ formatCurrency(cityGroup.averageReceipt) }}</div></td>
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
              <!-- <td>{{ formatCurrency(shop.totalRevenue).toFixed(0) }}</td> -->
              <td>{{ formatCurrency(shop.averageReceipt.toFixed(0)) }}</td>
            </tr>
          </template>
        </tbody>
        <tfoot>
          <tr>
            <td></td>
            <td><div>Общий итог:</div></td>
            <td><div>{{ totalReceipts }}</div></td>
            <td><div>{{ formatCurrency(totalRevenue) }}</div></td>
            <td><div>{{ formatCurrency(averageTotal) }}</div></td>
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
      return parseFloat((bytes / Math.pow(k, i)).toFixed(0)) + ' ' + sizes[i];
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
                  skipEmptyLines: true,
                  delimiter: '|',  // Указываем разделитель
                  transformHeader: (header) => header.trim(), // Убираем пробелы из заголовков
                  transform: (value) => {
                    // Убираем пробелы
                    if (typeof value === 'string') {
                      return value.trim();
                    }
                    return value;
                  }
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
                    skipEmptyLines: true,
                    delimiter: '|',  // Указываем разделитель
                    transformHeader: (header) => header.trim(), // Убираем пробелы из заголовков
                    transform: (value) => {
                      // Убираем пробелы
                      if (typeof value === 'string') {
                        return value.trim();
                      }
                      return value;
                    }
                  });
                  
                  if (path.includes('receipt')) {
                    if (!allData.receipts[city.code]) allData.receipts[city.code] = [];
                    allData.receipts[city.code].push(...parsed.data);
                    console.log(`Загружено чеков для ${city.name}:`, parsed.data.length);
                  } else if (path.includes('cartitem')) {
                    if (!allData.cartItems[city.code]) allData.cartItems[city.code] = [];
                    allData.cartItems[city.code].push(...parsed.data);
                    console.log(`Загружено товаров для ${city.name}:`, parsed.data.length);
                    // Проверяем первые несколько записей
                    if (parsed.data.length > 0) {
                      console.log('Пример товара:', parsed.data[0]);
                      console.log('total_price тип:', typeof parsed.data[0].total_price);
                    }
                  } else if (path.includes('shop')) {
                    if (!allData.shops[city.code]) allData.shops[city.code] = [];
                    allData.shops[city.code].push(...parsed.data);
                    console.log(`Загружено магазинов для ${city.name}:`, parsed.data.length);
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
            // Преобразуем total_price в число
            const price = parseFloat(item.total_price) || 0;
            return sum + price;
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
            totalRevenue: Math.round(data.totalRevenue * 100) / 100, // Округляем до копеек
            averageReceipt: data.receipts.length > 0 
              ? Math.round((data.totalRevenue / data.receipts.length) * 100) / 100
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
      
      // Выводим отладочную информацию
      console.log('Обработано записей:', {
        всего_чеков: Object.values(allData.receipts).flat().length,
        всего_товаров: Object.values(allData.cartItems).flat().length,
        всего_магазинов: Object.values(allData.shops).flat().length,
        записей_в_отчете: this.reportData.length
      });
    }
  }
};
</script>

<style scoped>
.ftp-report-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 32px 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background: #f8fafc;
  min-height: 100vh;
}

h1 {
  color: #1e293b;
  margin-bottom: 40px;
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.025em;
}

.control-panel {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  padding: 28px 32px;
  border-radius: 16px;
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  gap: 24px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  border: 1px solid rgba(226, 232, 240, 0.8);
  flex-wrap: wrap;
}

.date-selector {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 300px;
}

.date-selector label {
  font-weight: 500;
  color: #64748b;
  font-size: 14px;
  white-space: nowrap;
}

.date-selector input {
  padding: 10px 16px;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #334155;
  background: #ffffff;
  transition: all 0.2s ease;
  font-weight: 500;
}

.date-selector input:hover {
  border-color: #cbd5e1;
}

.date-selector input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.load-button {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.25), 0 2px 4px -1px rgba(59, 130, 246, 0.15);
  display: flex;
  align-items: center;
  gap: 8px;
}

.load-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3), 0 4px 6px -2px rgba(59, 130, 246, 0.2);
}

.load-button:active:not(:disabled) {
  transform: translateY(0);
}

.load-button:disabled {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.check-button {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.25), 0 2px 4px -1px rgba(16, 185, 129, 0.15);
}

.check-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(16, 185, 129, 0.3), 0 4px 6px -2px rgba(16, 185, 129, 0.2);
}

.check-button:disabled {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.batch-button {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.25), 0 2px 4px -1px rgba(139, 92, 246, 0.15);
}

.batch-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(139, 92, 246, 0.3), 0 4px 6px -2px rgba(139, 92, 246, 0.2);
}

.batch-button:disabled {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.test-button {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  color: white;
  border: none;
  padding: 12px 28px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px -1px rgba(245, 158, 11, 0.25), 0 2px 4px -1px rgba(245, 158, 11, 0.15);
}

.test-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 15px -3px rgba(245, 158, 11, 0.3), 0 4px 6px -2px rgba(245, 158, 11, 0.2);
}

.test-button:disabled {
  background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
  cursor: not-allowed;
  box-shadow: none;
}

.progress {
  margin: 32px 0;
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
  transition: width 0.3s ease;
  border-radius: 999px;
  position: relative;
  overflow: hidden;
}

.progress-fill::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.3),
    transparent
  );
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.progress p {
  margin-top: 16px;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  text-align: center;
}

.report-table {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-top: 32px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th {
  padding: 16px 20px;
  text-align: left;
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  font-weight: 600;
  color: #475569;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #e2e8f0;
}

td {
  padding: 16px 20px;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  font-size: 14px;
}

.city-row {
  background: linear-gradient(135deg, #eff6ff 0%, #e0f2fe 100%);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.city-row:hover {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.1);
}

.city-row td {
  font-weight: 600;
  color: #1e40af;
  border-bottom: 1px solid #cbd5e1;
}

.city-name {
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.shop-row {
  background: #ffffff;
  transition: all 0.15s ease;
}

.shop-row:hover {
  background: #fafbfc;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.04);
}

.shop-name {
  padding-left: 48px !important;
  color: #64748b;
  font-size: 14px;
  position: relative;
}

.shop-name::before {
  content: '';
  position: absolute;
  left: 24px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 1px;
  background: #cbd5e1;
}

.expand-icon {
  text-align: center;
  width: 40px;
  padding: 0 !important;
}

.toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 10px;
  color: #64748b;
  user-select: none;
  background: rgba(241, 245, 249, 0.8);
  border-radius: 6px;
  transition: all 0.15s ease;
}

.city-row:hover .toggle-icon {
  background: rgba(219, 234, 254, 0.8);
  color: #3b82f6;
}

tfoot td {
  background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
  border-top: 2px solid #e2e8f0;
  padding: 20px;
  font-weight: 700;
  color: #1e293b;
  font-size: 15px;
}

.error {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: #991b1b;
  padding: 16px 20px;
  border-radius: 12px;
  margin-top: 24px;
  font-weight: 500;
  font-size: 14px;
  border: 1px solid #fca5a5;
  box-shadow: 0 4px 6px -1px rgba(220, 38, 38, 0.1);
}

.ftp-files {
  background: white;
  padding: 24px;
  border-radius: 12px;
  margin: 24px 0;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.ftp-files h3 {
  margin: 0 0 16px 0;
  color: #1e293b;
  font-size: 18px;
  font-weight: 600;
}

.ftp-files ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

.ftp-files li {
  padding: 8px 12px;
  color: #64748b;
  font-family: 'SF Mono', Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  font-size: 13px;
  background: #f8fafc;
  margin-bottom: 4px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.ftp-files li:hover {
  background: #e2e8f0;
  color: #334155;
}

/* Анимация появления строк */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.shop-row {
  animation: fadeInUp 0.3s ease forwards;
}

/* Скроллбар для таблицы */
.report-table {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 #f1f5f9;
}

.report-table::-webkit-scrollbar {
  height: 8px;
}

.report-table::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.report-table::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.report-table::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* Адаптивность */
@media (max-width: 768px) {
  .control-panel {
    flex-direction: column;
    gap: 16px;
    padding: 20px;
  }
  
  .date-selector {
    flex-direction: column;
    width: 100%;
    min-width: auto;
  }
  
  .date-selector input {
    width: 100%;
  }
  
  .load-button,
  .check-button,
  .batch-button,
  .test-button {
    width: 100%;
  }
  
  table {
    font-size: 13px;
  }
  
  th, td {
    padding: 12px 16px;
  }
  
  .shop-name {
    padding-left: 32px !important;
  }
}
</style>