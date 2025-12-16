// Chart.js로 생성된 차트 인스턴스를 저장할 전역 변수입니다.
let keywordChart;

// 사용자의 설정을 관리하는 전역 객체입니다.
let settings = {
  minCount: 2,      // 키워드 최소 언급 횟수
  banList: [],      // 분석에서 제외할 키워드 목록
  maxSearchPage: 20000 // 갤러리 정보 탐색 시 최대 페이지
};

// HTML 문서가 완전히 로드되었을 때 스크립트를 실행합니다.
document.addEventListener('DOMContentLoaded', () => {
  // UI 요소들을 DOM에서 찾아와 변수에 할당합니다.
  const analyzeBtn = document.getElementById('analyzeBtn');
  const searchInput = document.getElementById('keywordSearch');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const rangeInfo = document.getElementById('rangeInfo');
  const progressBarContainer = document.getElementById('progressBarContainer');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  const keywordListElement = document.getElementById('keywordList');
  const articleListContainer = document.getElementById('articleListContainer');
  const articleListTitle = document.getElementById('articleListTitle');
  const articleListContent = document.getElementById('articleListContent');
  const closeArticleListBtn = document.getElementById('closeArticleListBtn');
  
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');
  const minCountInput = document.getElementById('minCount');
  const maxSearchPageInput = document.getElementById('maxSearchPage');

  // 날짜 범위가 초기화되었는지 여부를 추적하는 상태 변수입니다.
  let isDateRangeInitialized = false;

  // 저장된 설정을 불러와 UI에 적용합니다.
  loadSettings();
  
  // 초기 UI 상태를 설정합니다.
  analyzeBtn.textContent = '날짜 범위 불러오기';
  rangeInfo.textContent = '버튼을 눌러 분석 가능한 날짜를 확인하세요.';
  startDateInput.disabled = true;
  endDateInput.disabled = true;

  // 설정 버튼 클릭 시 설정 패널을 표시합니다.
  settingsBtn.addEventListener('click', () => { settingsPanel.style.display = 'flex'; });

  // 설정 패널의 닫기 버튼 클릭 시 패널을 숨깁니다.
  closeSettingsBtn.addEventListener('click', () => { settingsPanel.style.display = 'none'; });

  // '최소 언급 횟수' 설정이 변경되면 값을 업데이트하고 저장합니다.
  minCountInput.addEventListener('change', () => {
    settings.minCount = parseInt(minCountInput.value, 10) || 1;
    saveSettings();
  });

  // '최대 탐색 페이지' 설정이 변경되면 값을 업데이트하고 저장합니다.
  maxSearchPageInput.addEventListener('change', () => {
    settings.maxSearchPage = parseInt(maxSearchPageInput.value, 10) || 20000;
    saveSettings();
  });

  // 키워드 관련 글 목록의 닫기 버튼 클릭 시, 목록을 숨기고 키워드 리스트를 다시 표시합니다.
  closeArticleListBtn.addEventListener('click', () => {
    articleListContainer.style.display = 'none';
    keywordListElement.style.display = 'block';
  });

  // Chart.js를 사용하여 막대 차트를 초기화합니다.
  const ctx = document.getElementById('keywordChart').getContext('2d');
  keywordChart = new Chart(ctx, {
    type: 'bar', // 차트 종류
    data: { 
      labels: [], 
      datasets: [{ 
        label: '언급 횟수', 
        data: [], 
        backgroundColor: 'rgba(54, 162, 235, 0.5)', 
        borderColor: 'rgba(54, 162, 235, 1)', 
        borderWidth: 1 
      }] 
    },
    options: { 
      indexAxis: 'y', // y축을 기준으로 하는 가로 막대 차트
      scales: { 
        x: { beginAtZero: true, ticks: { color: '#e0e0e0' } }, 
        y: { ticks: { color: '#e0e0e0' } } 
      }, 
      plugins: { 
        legend: { display: false }, // 범례 숨김
        tooltip: { titleFont: { size: 14 }, bodyFont: { size: 12 } } 
      } 
    }
  });

  // 분석 시작 버튼의 클릭 이벤트 리스너입니다. UI 상태에 따라 두 가지 다른 동작을 수행합니다.
  analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true;
    progressBar.style.width = '0%';
    progressText.textContent = '0%';
    progressBarContainer.style.display = 'block';

    // 현재 활성화된 탭의 정보를 가져옵니다.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 1. 날짜 범위가 아직 초기화되지 않은 경우: 갤러리 정보를 가져옵니다.
    if (!isDateRangeInitialized) {
      analyzeBtn.textContent = '불러오는 중...';
      rangeInfo.textContent = '갤러리 정보 탐색 중...';
      
      // content.js에 'get_gallery_info' 메시지를 보내 갤러리 정보를 요청합니다.
      chrome.tabs.sendMessage(tab.id, { action: "get_gallery_info", maxSearchPage: settings.maxSearchPage }, (response) => {
        progressBarContainer.style.display = 'none';
        analyzeBtn.disabled = false;
        if (chrome.runtime.lastError || !response || !response.oldestDate) {
          rangeInfo.textContent = '갤러리 정보를 가져올 수 없습니다.';
          analyzeBtn.textContent = '다시 시도';
          return;
        }
        
        // 응답으로 받은 가장 오래된 날짜와 오늘 날짜를 사용하여 날짜 선택 인풋의 범위를 설정합니다.
        const oldestDate = response.oldestDate.split(' ')[0];
        const today = new Date().toISOString().split('T')[0];
        
        rangeInfo.textContent = `분석 가능: ${oldestDate} ~ 오늘`;
        startDateInput.disabled = false;
        endDateInput.disabled = false;
        startDateInput.min = oldestDate;
        startDateInput.max = today;
        endDateInput.min = oldestDate;
        endDateInput.max = today;
        startDateInput.value = today;
        endDateInput.value = today;
        
        // 날짜 범위가 초기화되었음을 표시하고, 버튼의 텍스트를 '분석 시작'으로 변경합니다.
        isDateRangeInitialized = true;
        analyzeBtn.textContent = '분석 시작';
      });

    } 
    // 2. 날짜 범위가 이미 초기화된 경우: 키워드 분석을 시작합니다.
    else {
      const startDate = startDateInput.value;
      const endDate = endDateInput.value;

      if (!startDate || !endDate || new Date(startDate) > new Date(endDate)) {
        alert('올바른 날짜 범위를 선택해주세요.');
        analyzeBtn.disabled = false;
        progressBarContainer.style.display = 'none';
        return;
      }
      analyzeBtn.textContent = '분석 중...';
      
      // content.js에 'analyze_date_range' 메시지를 보내 선택된 기간의 게시물 분석을 요청합니다.
      chrome.tabs.sendMessage(tab.id, { action: "analyze_date_range", startDate, endDate }, (response) => {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = '분석 시작';
        progressBarContainer.style.display = 'none';

        if (chrome.runtime.lastError) { console.error(chrome.runtime.lastError.message); return; }
        // 응답으로 받은 게시물 데이터를 사용하여 키워드 분석, 차트 및 목록 업데이트를 수행합니다.
        if (response && response.posts) {
          const keywords = analyzeTitles(response.posts);
          updateChart(keywords);
          updateKeywordList(keywords);
          // 나중에 검색 필터링을 위해 분석된 키워드 데이터를 data 속성에 저장합니다.
          searchInput.dataset.keywords = JSON.stringify(keywords);
        } else if (response && response.error) {
          alert(response.error);
        }
      });
    }
  });
  
  // content.js로부터 진행률 업데이트 메시지를 수신하여 프로그레스 바에 반영합니다.
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'progress_update') {
      progressBar.style.width = request.progress + '%';
      progressText.textContent = request.progress + '%';
    }
    if (request.action === 'search_progress_update') {
      progressBar.style.width = request.progress + '%';
      progressText.textContent = request.progress + '%';
      rangeInfo.textContent = request.text;
    }
  });

  // 키워드 검색창의 입력 이벤트에 대한 리스너입니다.
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    let allKeywords;
    try {
      allKeywords = JSON.parse(searchInput.dataset.keywords || '[]');
    } catch (e) {
      console.error("Error parsing keywords from dataset:", e);
      allKeywords = [];
    }
    
    // 입력된 검색어에 따라 키워드 목록을 실시간으로 필터링하여 다시 표시합니다.
    if (!query) {
      updateKeywordList(allKeywords);
      return;
    }
    const filteredKeywords = allKeywords.filter(kw => kw[0].toLowerCase().includes(query));
    updateKeywordList(filteredKeywords, true);
  });
});

// chrome.storage에서 설정을 불러오는 함수입니다.
function loadSettings() {
  chrome.storage.sync.get({ minCount: 2, banList: [], maxSearchPage: 20000 }, (loadedSettings) => {
    settings = loadedSettings;
    // 불러온 설정 값으로 UI를 업데이트합니다.
    document.getElementById('minCount').value = settings.minCount;
    document.getElementById('maxSearchPage').value = settings.maxSearchPage;
    renderBanList();
  });
}

// chrome.storage에 현재 설정을 저장하는 함수입니다.
function saveSettings() {
  chrome.storage.sync.set(settings, () => { console.log('Settings saved:', settings); });
}

// 현재 밴 리스트를 설정 패널에 렌더링하는 함수입니다.
function renderBanList() {
  const container = document.getElementById('banListContainer');
  container.innerHTML = '';
  settings.banList.forEach(word => {
    const wordEl = document.createElement('span');
    wordEl.className = 'ban-item';
    wordEl.textContent = word;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-ban-item';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = `'${word}'를 밴 리스트에서 제거`;
    // 제거 버튼 클릭 시 밴 리스트에서 해당 단어를 제거하고 UI를 다시 렌더링합니다.
    removeBtn.addEventListener('click', () => {
      const index = settings.banList.indexOf(word);
      if (index > -1) {
        settings.banList.splice(index, 1);
        saveSettings();
        renderBanList();
      }
    });
    wordEl.appendChild(removeBtn);
    container.appendChild(wordEl);
  });
}

// 게시물 제목 배열을 받아 키워드를 분석하고, [단어, 빈도, 관련글] 배열로 반환하는 함수입니다.
function analyzeTitles(posts) {
  const keywordData = {}; // { word: { count: number, articles: Map<url, {title, url}> } }
  // 분석에서 제외할 불용어 목록입니다.
  const stopWords = new Set(['은', '는', '이', '가', '을', '를', '의', '에', '도', '으로', '에서', '것', '수', '그', '저', '이거', '오늘', '내일', '어제', 'ㅋㅋ', 'ㅋㅋㅋ', 'ㅎㅎ', 'ㅠㅠ', 'ㅜㅜ', 'ㄷㄷ', 'ㅎㄷㄷ', 'ㅅㅂ', 'ㅂㅅ', 'ㅇㅇ']);

  posts.forEach(post => {
    // 제목에서 괄호, 태그 등을 제거하여 텍스트를 정제합니다.
    const cleanedTitle = post.title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '').replace(/<.*?>/g, '');
    const words = cleanedTitle.match(/[가-힣a-zA-Z0-9]+/g) || [];
    // 단어별로 빈도수와 관련 글 정보를 집계합니다.
    words.forEach(word => {
        const lowerCaseWord = word.toLowerCase();
        if (!keywordData[lowerCaseWord]) {
          keywordData[lowerCaseWord] = { count: 0, articles: new Map() };
        }
        keywordData[lowerCaseWord].count++;
        keywordData[lowerCaseWord].articles.set(post.url, { title: post.title, url: post.url });
    });
  });
  
  // 집계된 데이터를 정렬하고 필터링합니다.
  const sortedKeywords = Object.entries(keywordData)
    .map(([word, data]) => {
      return [
        word,
        data.count,
        Array.from(data.articles.values())
      ];
    })
    .sort((a, b) => b[1] - a[1]) // 빈도수 내림차순 정렬
    .filter(([word, count, articles]) => {
      // 최소 언급 횟수, 밴 리스트, 불용어, 단어 길이를 기준으로 필터링합니다.
      const isOverMinCount = count >= settings.minCount;
      const isNotBanned = !settings.banList.includes(word);
      const isNotStopword = !stopWords.has(word) && word.length > 1;
      return isOverMinCount && isNotBanned && isNotStopword;
    });
  
  console.log('analyzeTitles returns:', sortedKeywords);
  return sortedKeywords;
}

// 차트의 막대 색상을 동적으로 생성하는 함수입니다.
function generateChartColors(numColors) {
  const colors = [];
  const hueStep = 360 / (numColors > 1 ? numColors : 1);
  for (let i = 0; i < numColors; i++) {
    const hue = i * hueStep;
    colors.push(`hsla(${hue}, 70%, 60%, 0.7)`);
  }
  return colors;
}

// 분석된 키워드 데이터를 사용하여 차트를 업데이트하는 함수입니다.
function updateChart(keywords) {
  console.log('updateChart received:', keywords);

  if (!Array.isArray(keywords)) {
    console.error('updateChart expected an array, but received:', typeof keywords);
    return;
  }

  // 상위 15개 키워드만 차트에 표시합니다.
  const topKeywords = keywords.slice(0, 15);
  const labels = topKeywords.map(kw => kw[0]);
  const data = topKeywords.map(kw => kw[1]);
  
  const backgroundColors = generateChartColors(topKeywords.length);
  const borderColors = backgroundColors.map(color => color.replace('0.7', '1'));

  console.log('Final chart data:', { labels, data });

  try {
    keywordChart.data.labels = labels;
    const dataset = keywordChart.data.datasets[0];
    dataset.data = data;
    dataset.backgroundColor = backgroundColors;
    dataset.borderColor = borderColors;
    keywordChart.update();
  } catch (e) {
    console.error('Error updating chart:', e);
    console.error('Chart.js object state:', keywordChart);
  }
}

// 제목 내에서 특정 키워드를 하이라이트 처리하는 헬퍼 함수입니다.
function highlightKeyword(title, keyword) {
  if (!keyword) return title;
  const regex = new RegExp(keyword, 'gi');
  return title.replace(regex, match => `<span style="color: yellow;">${match}</span>`);
}

// 분석된 키워드 데이터를 사용하여 UI의 목록을 업데이트하는 함수입니다.
function updateKeywordList(keywords, isSearchResult = false) {
  const listElement = document.getElementById('keywordList');
  listElement.innerHTML = '';
  const keywordsToShow = isSearchResult ? keywords : keywords.slice(0, 50); // 검색 결과가 아니면 상위 50개만 표시
  if (keywordsToShow.length === 0) {
    listElement.innerHTML = '<div class="no-results">결과가 없습니다.</div>';
    return;
  }
  keywordsToShow.forEach(([word, count, articles]) => {
    const item = document.createElement('div');
    item.className = 'keyword-item';
    
    // 각 키워드 아이템 클릭 시, 해당 키워드가 언급된 글 목록을 보여줍니다.
    item.addEventListener('click', () => {
      document.getElementById('keywordList').style.display = 'none';
      document.getElementById('articleListContainer').style.display = 'flex';
      document.getElementById('articleListTitle').innerText = `'${word}' 키워드 관련 글 (${count}회 언급)`;
      
      const articleListContent = document.getElementById('articleListContent');
      articleListContent.innerHTML = '';

      if (articles && articles.length > 0) {
        articles.forEach(article => {
          const articleItem = document.createElement('div');
          articleItem.className = 'article-item';
          articleItem.innerHTML = highlightKeyword(article.title, word);
          articleItem.dataset.url = article.url;
          // 글 제목 클릭 시 새 탭에서 해당 글로 이동합니다.
          articleItem.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(articleItem.dataset.url, '_blank');
          });
          articleListContent.appendChild(articleItem);
        });
      } else {
        articleListContent.innerHTML = '<div class="no-results">관련 글을 찾을 수 없습니다.</div>';
      }
    });

    // 키워드 텍스트, 언급 횟수, 밴 버튼을 생성하여 아이템에 추가합니다.
    const text = document.createElement('span');
    text.className = 'keyword-text';
    text.textContent = word;
    const countSpan = document.createElement('span');
    countSpan.className = 'keyword-count';
    countSpan.textContent = count;
    const banBtn = document.createElement('button');
    banBtn.className = 'ban-btn';
    banBtn.title = `'${word}' 키워드를 밴 리스트에 추가`;
    banBtn.innerHTML = '🚫';
    // 밴 버튼 클릭 시 해당 키워드를 밴 리스트에 추가하고 목록에서 즉시 제거합니다.
    banBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!settings.banList.includes(word)) {
        settings.banList.push(word);
        saveSettings();
        renderBanList();
      }
      item.remove();
    });
    const leftGroup = document.createElement('div');
    leftGroup.className = 'keyword-left-group';
    leftGroup.appendChild(banBtn);
    leftGroup.appendChild(text);
    item.appendChild(leftGroup);
    item.appendChild(countSpan);
    listElement.appendChild(item);
  });
}