// content.js가 주입된 탭을 추적하기 위한 Map 객체입니다.
// key: 탭 ID, value: true
const injectedContentScripts = new Map();

// content.js 주입 후 사이드바를 즉시 토글해야 하는 탭을 저장하는 Map 객체입니다.
// 주입이 완료되기 전에 사용자가 아이콘을 클릭하는 경우를 처리합니다.
const pendingToggleTabs = new Map();

// 확장 프로그램의 아이콘(Action)이 클릭되었을 때 실행될 리스너를 추가합니다.
chrome.action.onClicked.addListener(async (tab) => {

  // 현재 활성화되어 있고 현재 창에 있는 탭의 정보를 가져옵니다.
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // 탭 정보가 유효하고 URL이 DCInside 갤러리 페이지인지 확인합니다.
  if (activeTab && activeTab.id && activeTab.url && activeTab.url.includes("gall.dcinside.com")) {
    const tabId = activeTab.id;

    // 이 탭에 content.js가 아직 주입되지 않았는지 확인합니다.
    if (!injectedContentScripts.has(tabId)) {

      // 주입 후 사이드바를 토글해야 함을 표시합니다.
      pendingToggleTabs.set(tabId, true);

      // 스크립트를 페이지에 프로그래매틱하게 주입합니다.
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      }, () => {
        // 주입 과정에서 에러가 발생했는지 확인합니다.
        if (chrome.runtime.lastError) {
          console.error("content.js 주입 실패:", chrome.runtime.lastError);
          // 에러 발생 시, 토글 대기 목록에서 해당 탭을 제거합니다.
          pendingToggleTabs.delete(tabId);
        }
        // 주입 성공 여부는 content.js로부터 'content_script_ready' 메시지를 받아 최종 확인합니다.
      });
    } else {
      // content.js가 이미 주입된 경우, 사이드바를 토글하라는 메시지만 보냅니다.
      chrome.tabs.sendMessage(tabId, { action: "toggle_sidebar" });
    }
  } else {
    // 현재 페이지가 DCInside 갤러리가 아닐 경우 로그를 남깁니다.
    console.log("DCInside 페이지가 아니므로 사이드바를 열지 않습니다.");
  }
});

// 다른 스크립트(주로 content.js)로부터 메시지를 수신하는 리스너입니다.
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 메시지를 보낸 탭의 ID가 있는지 확인합니다.
  if (sender.tab && sender.tab.id) {
    const tabId = sender.tab.id;

    // content.js가 성공적으로 로드되고 준비되었을 때의 처리입니다.
    if (request.action === "content_script_ready") {
      // 해당 탭이 주입되었음을 기록합니다.
      injectedContentScripts.set(tabId, true);

      // 이 탭에 대해 보류 중인 토글 요청이 있었는지 확인하고, 있었다면 실행합니다.
      if (pendingToggleTabs.has(tabId)) {
        chrome.tabs.sendMessage(tabId, { action: "toggle_sidebar" });
        // 요청을 처리했으므로 대기 목록에서 제거합니다.
        pendingToggleTabs.delete(tabId);
      }
    } 
    // content.js가 언로드(페이지 이동, 새로고침 등)될 때의 처리입니다.
    else if (request.action === "content_script_unloaded") {
      console.log(`content.js 언로드 감지: tabId ${tabId}`);
      // 해당 탭의 주입 기록과 토글 대기 상태를 모두 제거합니다.
      injectedContentScripts.delete(tabId);
      pendingToggleTabs.delete(tabId); 
    }
  }
});

// 탭이 닫힐 때 실행되는 리스너입니다. 메모리 누수 방지를 위해 사용됩니다.
chrome.tabs.onRemoved.addListener((tabId) => {
  // 닫힌 탭이 주입 기록에 있다면 제거합니다.
  if (injectedContentScripts.has(tabId)) {
    injectedContentScripts.delete(tabId);
  }
  // 닫힌 탭이 토글 대기 목록에 있다면 제거합니다.
  if (pendingToggleTabs.has(tabId)) {
    pendingToggleTabs.delete(tabId);
  }
});