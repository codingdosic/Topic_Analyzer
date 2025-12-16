// 사이드바의 DOM ID를 상수로 정의합니다.
const SIDEBAR_ID = 'dc-topic-analyzer-sidebar';

// 갤러리 정보(마지막 페이지, 가장 오래된 날짜)를 캐싱하기 위한 변수입니다.
let galleryInfoCache = null;

// 사이드바를 토글하는 함수입니다.
function toggleSidebar() { 

  // 사이드바 객체 저장
  const existingSidebar = document.getElementById(SIDEBAR_ID); 

  // 사이드바가 이미 존재하면 제거하고, 페이지의 오른쪽 여백을 초기화합니다.
  if (existingSidebar) { 
    existingSidebar.remove(); 
    document.documentElement.style.marginRight = ''; 
  } else { 
    // 사이드바가 없으면 새로운 iframe을 생성합니다.
    const sidebar = document.createElement('iframe'); 
    sidebar.id = SIDEBAR_ID; 
    sidebar.src = chrome.runtime.getURL('sidebar.html'); 
    sidebar.style.cssText = `position: fixed; top: 0; right: 0; width: 350px; height: 100%; border: none; z-index: 9999; box-shadow: -2px 0 5px rgba(0,0,0,0.2);`; 
    document.body.appendChild(sidebar); 
    // 사이드바 너비만큼 페이지의 오른쪽 여백을 주어 내용이 가려지지 않게 합니다.
    document.documentElement.style.marginRight = '350px'; 
  } 
}

// 특정 페이지 번호의 HTML 문서를 fetch하는 함수입니다.
async function fetchPage(pageNum) { 
  const hostname = window.location.hostname; // gall.dcinside.com
  const path = window.location.pathname; // /mgallery/board/lists
  const urlParams = new URLSearchParams(window.location.search); // ?id=mfgo
  const galleryId = urlParams.get('id'); // mfgo 저장
  if (!galleryId) throw new Error("갤러리 ID를 찾을 수 없습니다."); 
  
  // 항상 HTTPS를 사용하여 대상 URL을 구성합니다.
  const pageUrl = `https://${hostname}${path}?id=${galleryId}&page=${pageNum}`; 
  
  // 페이지를 fetch합니다.
  const response = await fetch(pageUrl); 
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`); 

  // 응답 본문을 텍스트로 읽고, DOMParser를 사용하여 HTML 문서로 파싱합니다.
  const html = await response.text(); 
  const parser = new DOMParser(); 
  // 받아온 HTML 텍스트를 DOM 객체로 파싱하여 반환합니다.
  return parser.parseFromString(html, 'text/html'); 
}

// fetchPage 함수가 실패할 경우 재시도하는 로직을 포함한 래퍼 함수입니다.
async function retryFetchPage(pageNum, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      // 페이지 fetch를 시도합니다.
      return await fetchPage(pageNum);
    } catch (error) {
      console.warn(`Attempt ${i + 1} to fetch page ${pageNum} failed. Retrying in ${delay / 1000}s...`, error);
      // 마지막 재시도가 아니면, 딜레이 후 다시 시도합니다.
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
        // 재시도 딜레이를 점진적으로 늘립니다 (Exponential backoff).
        delay *= 2;
      } else {
        // 모든 재시도가 실패하면 에러를 던집니다.
        throw error;
      }
    }
  }
}

// 특정 페이지에 유효한 게시글이 존재하는지 확인하는 함수입니다.
async function doesPageHavePosts(pageNum) { 
  console.log(`doesPageHavePosts 호출: 페이지 ${pageNum}`);
  try { 
    const doc = await retryFetchPage(pageNum); 
    const postRows = doc.querySelectorAll('tr.us-post');
    let hasValidPost = false;
    for (const row of postRows) {
        const titleEl = row.querySelector('.gall_tit a');
        const dateEl = row.querySelector('.gall_date');
        // 제목과 날짜 정보가 모두 유효한 게시물이 하나라도 있다면, 해당 페이지는 유효한 것으로 간주합니다.
        if (titleEl && titleEl.innerText.trim() !== '' && dateEl && dateEl.hasAttribute('title') && dateEl.getAttribute('title').trim() !== '') {
            hasValidPost = true;
            break;
        }
    }
    console.log(`  페이지 ${pageNum}에 유효한 게시물 존재 여부: ${hasValidPost}`);
    return hasValidPost;
  } catch (e) { 
    console.error(`doesPageHavePosts 오류 (페이지 ${pageNum}):`, e);
    return false; 
  } 
}

// 특정 페이지에서 가장 오래된 게시물의 날짜를 찾아 반환하는 함수입니다.
async function getOldestDateOnPage(pageNum) { 
  console.log(`getOldestDateOnPage 호출: 페이지 ${pageNum}`);
  try { 
    const doc = await retryFetchPage(pageNum);

    // tr 태그이면서(광고는 tr 태그 존재 x) us-post 클래스를 가지는 요소의 자식의 .gall_date를 모두 가져옴
    const dateElements = Array.from(doc.querySelectorAll('tr.us-post .gall_date'));
    
    let minDate = null;

    dateElements.forEach(el => {
      const dateStr = el.getAttribute('title');
      if (dateStr) {
        // 날짜 문자열 'YYYY-MM-DD HH:MM:SS'을 파싱하여 Date 객체를 생성합니다.
        const year = parseInt(dateStr.substring(0, 4));
        const month = parseInt(dateStr.substring(5, 7)) - 1; // JavaScript의 월은 0부터 시작합니다.
        const day = parseInt(dateStr.substring(8, 10));
        const hour = parseInt(dateStr.substring(11, 13));
        const minute = parseInt(dateStr.substring(14, 16));
        const second = parseInt(dateStr.substring(17, 19));
        
        const currentDate = new Date(year, month, day, hour, minute, second);

        // 유효한 Date 객체인 경우에만, 현재까지 찾은 가장 오래된 날짜와 비교합니다.
        if (!isNaN(currentDate.getTime())) {

          // minDate의 초기값이 null이거나, 현재 날짜가 더 오래된 경우 minDate를 갱신합니다.
          if (minDate === null || currentDate < minDate) {
            minDate = currentDate;
          }
        }
      }
    });

    if (minDate) {
      // 찾은 가장 오래된 날짜를 'YYYY-MM-DD HH:MM:SS' 형식의 문자열로 포맷하여 반환합니다.
      const year = minDate.getFullYear();
      const month = (minDate.getMonth() + 1).toString().padStart(2, '0');
      const day = minDate.getDate().toString().padStart(2, '0');
      const hours = minDate.getHours().toString().padStart(2, '0');
      const minutes = minDate.getMinutes().toString().padStart(2, '0');
      const seconds = minDate.getSeconds().toString().padStart(2, '0');
      const formattedDate = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      console.log(`  페이지 ${pageNum}에서 가장 오래된 날짜: ${formattedDate}`);
      return formattedDate;
    } else {
      console.log(`  페이지 ${pageNum}에서 유효한 날짜를 찾지 못함.`);
      return null;
    }
  } catch (e) { 
    console.error(`getOldestDateOnPage 오류 (페이지 ${pageNum}):`, e);
    return null; 
  } 
}

// 특정 페이지의 모든 게시물 날짜를 배열로 반환하는 유틸리티 함수입니다.
async function getPostDatesOnPage(pageNum) { 
  try { 
    const doc = await retryFetchPage(pageNum); 
    const dateElements = Array.from(doc.querySelectorAll('tr.us-post .gall_date'));

    // dateElements에서 title 속성 값을 배열로 추출, falsey한 값은 필터링
    return dateElements.map(el => el.getAttribute('title')).filter(Boolean); 
  } catch (e) { 
    return []; 
  } 
}

// 특정 페이지의 첫 번째 게시물 날짜를 반환하는 유틸리티 함수입니다.
async function getFirstPostDateOnPage(pageNum) { 
  try { 
    const dates = await getPostDatesOnPage(pageNum); 

    // 첫 번째 날짜를 반환하거나, 없으면 null 반환
    return dates.length > 0 ? dates[0] : null; 
  } catch (e) { 
    return null; 
  } 
}

// 이진 탐색을 사용하여 게시물이 있는 마지막 페이지 번호를 찾는 함수입니다.
async function findLastPageWithPosts(maxSearchPage) {
  let low = 1, high = maxSearchPage, lastPageWithPosts = 0;

  // log2(high) -> 2로 몇번 나누면 1이 되는지 계산(이진 탐색을 몇번 해야하는지) + ceil로 실수 정수로 반올림
  const maxSteps = Math.ceil(Math.log2(high));
  let currentStep = 0;

  // 이진 탐색 루프 
  while (low <= high) {

    // 프로그레스 바 업데이트
    currentStep++;
    const progress = Math.round((currentStep / maxSteps) * 100); // 백분율 계산 + 반올림

    // 탐색 진행 상황을 사이드바로 전송하여 프로그레스 바로 표시하게 합니다.
    chrome.runtime.sendMessage({ 
      action: "search_progress_update", 
      progress: progress > 100 ? 100 : progress, // 100% 초과 방지
      text: `갤러리 정보 탐색 중... (${currentStep}/${maxSteps})` // 단계 표시
    });

    // 중간 페이지 계산
    const mid = Math.floor((low + high) / 2);
    if (mid === 0) break;
    // 중간 페이지에 게시물이 있는지 확인합니다.
    const hasPosts = await doesPageHavePosts(mid);
    if (hasPosts) {
      // 게시물이 있으면, 해당 페이지를 기록하고 더 뒷 페이지를 탐색합니다.
      lastPageWithPosts = mid;
      low = mid + 1;
    } else {
      // 게시물이 없으면, 더 앞 페이지를 탐색합니다.
      high = mid - 1;
    }
  }
  return lastPageWithPosts;
}

// 갤러리의 전체 정보(마지막 페이지의 가장 오래된 날짜)를 찾는 함수입니다.
async function findGalleryInfo(maxSearchPage) {
  console.log('findGalleryInfo 시작');
  // DCInside는 페이지 번호가 클수록 오래된 게시물이므로, 게시물이 있는 마지막 페이지가 가장 오래된 페이지입니다.
  const pageWithOldestPosts = await findLastPageWithPosts(maxSearchPage);
  console.log(`findLastPageWithPosts 결과 (가장 오래된 페이지): ${pageWithOldestPosts}`);

  if (!pageWithOldestPosts) {
    console.log('게시물이 있는 마지막 페이지를 찾을 수 없습니다. findGalleryInfo 종료.');
    return { lastPage: null, oldestDate: null };
  }

  // 찾은 가장 오래된 페이지에서, 가장 오래된 게시물의 날짜를 가져옵니다.
  const oldestDateFound = await getOldestDateOnPage(pageWithOldestPosts);
  console.log(`페이지 ${pageWithOldestPosts}에서 가장 오래된 날짜: ${oldestDateFound}`);

  if (!oldestDateFound) {
      // 페이지는 찾았지만 날짜를 못 찾는 예외적인 경우를 처리합니다.
      return { lastPage: pageWithOldestPosts, oldestDate: null };
  }
  
  // 분석 가능한 마지막 페이지와 가장 오래된 날짜를 반환합니다.
  return { lastPage: pageWithOldestPosts, oldestDate: oldestDateFound };
}

// 사용자가 선택한 시작 날짜가 포함된 가장 '뒷' 페이지(페이지 번호가 큰)를 이진 탐색으로 찾습니다.
async function findCrawlStartPage(startDate, maxPage) {
    let low = 1, high = maxPage, bestPage = 1;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (mid === 0) break;
        const lastPostDate = await getOldestDateOnPage(mid);
        if (!lastPostDate) {
            high = mid - 1;
            continue;
        }
        // 페이지의 가장 오래된 글이 시작 날짜보다 이후이면, 더 뒷 페이지에 있을 수 있습니다.
        if (lastPostDate.split(' ')[0] >= startDate) {
            bestPage = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return bestPage;
}

// 사용자가 선택한 종료 날짜가 포함된 가장 '앞' 페이지(페이지 번호가 작은)를 이진 탐색으로 찾습니다.
async function findCrawlEndPage(endDate, maxPage) {
    let low = 1, high = maxPage, bestPage = maxPage;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (mid === 0) break;
        const lastPostDate = await getOldestDateOnPage(mid);
        if (!lastPostDate) {
            low = mid + 1;
            continue;
        }
        // 페이지의 가장 오래된 글이 종료 날짜보다 이전이면, 더 앞 페이지에 있을 수 있습니다.
        if (lastPostDate.split(' ')[0] <= endDate) {
            bestPage = mid;
            high = mid - 1; 
        } else {
            low = mid + 1;
        }
    }
    return bestPage;
}

// 지정된 페이지 범위 내의 모든 게시물 정보를 스크래핑하는 함수입니다.
async function scrapePostsInPageRange(startPage, endPage) { 
  const CONCURRENT_LIMIT = 5; // 서버 부하를 줄이기 위해 동시 요청 수를 5로 제한합니다.
  const MIN_DELAY_BETWEEN_BATCHES = 1000; // 요청 배치 사이의 최소 딜레이 (1초)
  const MAX_DELAY_BETWEEN_BATCHES = 3000; // 요청 배치 사이의 최대 딜레이 (3초)

  // length: N -> 길이가 N인 배열 생성, (_, i) -> startPage + i 로 startPage부터 endPage까지의 페이지 번호 배열 생성
  const allPageNumbers = Array.from({length: endPage - startPage + 1}, (_, i) => startPage + i); 
  const totalPages = allPageNumbers.length; 
  let pagesDone = 0; 
  let allPosts = []; // 스크래핑한 게시물(제목, 날짜, URL)을 저장할 배열

  // 페이지 번호 배열을 CONCURRENT_LIMIT 크기의 chunk로 나누어 처리합니다.
  for (let i = 0; i < totalPages; i += CONCURRENT_LIMIT) { 
    const chunk = allPageNumbers.slice(i, i + CONCURRENT_LIMIT); 
    
    // 현재 chunk에 포함된 모든 페이지를 동시에 fetch하고, 게시물 정보를 추출합니다.
    const fetchPagePromises = chunk.map(pageNum => { 
      return retryFetchPage(pageNum).then(doc => { 
        const postsOnPage = []; 
        doc.querySelectorAll('tr.us-post').forEach(row => { 
          const titleEl = row.querySelector('.gall_tit a'); 
          const dateEl = row.querySelector('.gall_date'); 
          if (titleEl && dateEl && dateEl.hasAttribute('title')) { 
            postsOnPage.push({ title: titleEl.innerText, date: dateEl.getAttribute('title'), url: titleEl.href });
          } 
        }); 
        return postsOnPage; 
      }).catch(err => { 
        console.warn(`Warning: Failed to fetch or parse page ${pageNum}. It will be skipped.`, err); 
        return []; 
      }); 
    }); 

    const settledPageResults = await Promise.allSettled(fetchPagePromises); 
    settledPageResults.forEach(result => { 
      if (result.status === 'fulfilled' && Array.isArray(result.value)) { 
        allPosts.push(...result.value); 
      } 
    }); 

    pagesDone += chunk.length; 
    const progress = Math.round((pagesDone / totalPages) * 100); 
    // 스크래핑 진행 상황을 사이드바로 전송합니다.
    chrome.runtime.sendMessage({ action: "progress_update", progress: progress }); 

    // 다음 chunk를 처리하기 전에 무작위 딜레이를 적용하여 서버 부하를 줄입니다.
    if (i + CONCURRENT_LIMIT < totalPages) { 
      const randomDelay = Math.floor(Math.random() * (MAX_DELAY_BETWEEN_BATCHES - MIN_DELAY_BETWEEN_BATCHES + 1)) + MIN_DELAY_BETWEEN_BATCHES;
      await new Promise(resolve => setTimeout(resolve, randomDelay));
    } 
  } 
  return allPosts; 
}

// 'get_gallery_info' 액션 요청을 처리하는 핸들러 함수입니다.
async function handleGetGalleryInfo(request, sendResponse) {
    try {
        const galleryInfo = await findGalleryInfo(request.maxSearchPage);
        // 결과를 캐시에 저장합니다.
        galleryInfoCache = galleryInfo;
        // 결과를 요청한 곳(사이드바)으로 보냅니다.
        sendResponse(galleryInfo);
    } catch (error) {
        console.error("Error in handleGetGalleryInfo:", error);
        sendResponse({ error: error.message });
    }
}

// 'analyze_date_range' 액션 요청을 처리하는 핸들러 함수입니다.
async function handleAnalyzeDateRange(request, sendResponse) {
  try {
    const { startDate, endDate } = request;
    const { lastPage } = galleryInfoCache;
    if (!lastPage) {
      sendResponse({ error: "갤러리 정보를 먼저 불러와주세요." });
      return;
    }
    console.log(`날짜로 페이지 검색 시작: ${startDate} ~ ${endDate}`);
    
    // 이진 탐색을 통해 실제 스크래핑할 페이지 범위를 계산합니다.
    // 종료 날짜가 포함된 가장 '앞' 페이지(페이지 번호가 작은)
    const actualCrawlStartPageNum = await findCrawlEndPage(endDate, lastPage);
    // 시작 날짜가 포함된 가장 '뒷' 페이지(페이지 번호가 큰)
    const actualCrawlEndPageNum = await findCrawlStartPage(startDate, lastPage);

    console.log(`페이지 범위 확인: ${actualCrawlStartPageNum} ~ ${actualCrawlEndPageNum}`);
    // 스크래핑할 유효한 페이지 범위가 있는지 확인합니다.
    if (actualCrawlStartPageNum === 0 || actualCrawlEndPageNum === 0 || actualCrawlStartPageNum > actualCrawlEndPageNum) {
      console.log("분석할 유효한 페이지 범위가 없습니다.");
      sendResponse({ titles: [] });
      return;
    }
    // 계산된 페이지 범위 내의 게시물들을 스크래핑합니다.
    const posts = await scrapePostsInPageRange(actualCrawlStartPageNum, actualCrawlEndPageNum);
    
    // 스크래핑된 게시물들 중에서 사용자가 선택한 날짜 범위에 해당하는 것만 필터링합니다.
    const filteredPosts = posts
      .filter(post => {
        const postDate = post.date.split(' ')[0];
        return postDate >= startDate && postDate <= endDate;
      });
    // 필터링된 결과를 요청한 곳(사이드바)으로 보냅니다.
    sendResponse({ posts: filteredPosts });
  } catch (error) {
    console.error("Error in handleAnalyzeDateRange:", error);
    sendResponse({ error: error.message });
  }
}

// 다른 스크립트(주로 사이드바)로부터 메시지를 수신하고, 액션에 따라 적절한 핸들러를 호출하는 라우터입니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const actions = {
    "toggle_sidebar": () => toggleSidebar(),
    "get_gallery_info": (req) => handleGetGalleryInfo(req, sendResponse),
    "analyze_date_range": (req) => handleAnalyzeDateRange(req, sendResponse)
  };
  const actionHandler = actions[request.action];
  if (actionHandler) {
    actionHandler(request);
    // 비동기적으로 응답을 보낼 경우(sendResponse를 나중에 호출) true를 반환해야 합니다.
    return (request.action === "get_gallery_info" || request.action === "analyze_date_range");
  }
});

// 페이지가 언로드될 때(새로고침, 이동 등), background.js에 알려 리소스를 정리하도록 합니다.
window.addEventListener('unload', () => {
  chrome.runtime.sendMessage({ action: "content_script_unloaded" }); 
});

// content.js가 성공적으로 로드되었음을 background.js에 알립니다.
chrome.runtime.sendMessage({ action: "content_script_ready" });
