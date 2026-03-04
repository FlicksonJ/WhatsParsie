// ==========================================
// 1. GLOBAL STATE & THEME ENGINE
// ==========================================
let globalChats = {};
let activeChatId = null;
const MY_WHATSAPP_NAME = "Flickson";

// Theme Setup (Works for both Dashboard & Side Nav icons)
let isDarkMode = document.body.getAttribute('data-theme') === 'dark';

function toggleTheme() {
    isDarkMode = !isDarkMode;
    document.body.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    
    // Update Dashboard Button
    const dashBtn = document.getElementById('dashThemeBtn');
    dashBtn.innerHTML = isDarkMode 
        ? '<i class="fa-solid fa-sun"></i> Light Mode' 
        : '<i class="fa-solid fa-moon"></i> Dark Mode';
        
    // Update Side Nav Icon
    document.getElementById('themeIcon').className = isDarkMode ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
}

document.getElementById('dashThemeBtn').addEventListener('click', toggleTheme);
document.getElementById('navThemeBtn').addEventListener('click', toggleTheme);

// DOM Elements
const dashboardView = document.getElementById('dashboard-view');
const chatView = document.getElementById('chat-view');
const loadBtn = document.getElementById('loadBtn');
const chatListEl = document.getElementById('chatList');
const messageAreaEl = document.getElementById('messageArea');
const chatHeaderEl = document.getElementById('chatHeader');

// Search Elements
const searchInput = document.getElementById('searchInput');
const toggleInChatSearch = document.getElementById('toggleInChatSearch');
const inChatSearchContainer = document.getElementById('inChatSearchContainer');
const closeInChatSearch = document.getElementById('closeInChatSearch');
const inChatSearchInput = document.getElementById('inChatSearchInput');

// ==========================================
// 2. THE PARSER ENGINE (WITH GROUP DETECTION)
// ==========================================
function parseChat(text) {
    const regex = /^\[?(\d{2}[/.]\d{2}[/.]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?\s?[APM]?)\]?\s?(?:- )?([^:]+):\s([\s\S]+?)(?=\n\[?\d{2}[/.]\d{2}[/.]\d{2,4}|$)/gm;
    const messages = [];
    let match;
    const uniqueSenders = new Set();
    
    while ((match = regex.exec(text)) !== null) {
        const senderName = match[3].trim();
        uniqueSenders.add(senderName);
        
        messages.push({
            date: match[1],
            time: match[2],
            sender: senderName,
            content: match[4].trim(),
            isMe: senderName.toLowerCase().includes(MY_WHATSAPP_NAME.toLowerCase())
        });
    }
    
    // If there are more than 2 distinct senders, it's a group!
    return {
        messages: messages,
        isGroup: uniqueSenders.size > 2
    };
}

// ==========================================
// 3. FOLDER INGESTION & VIEW SWAP
// ==========================================
loadBtn.addEventListener('click', async () => {
    try {
        const dirHandle = await window.showDirectoryPicker();
        
        const originalHTML = loadBtn.innerHTML;
        loadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Parsing archives...';
        loadBtn.disabled = true;
        
        globalChats = {};

        for await (const entry of dirHandle.values()) {
            if (entry.name.endsWith('.zip')) {
                const file = await entry.getFile();
                const zip = await JSZip.loadAsync(file);
                
                const fileNames = Object.keys(zip.files);
                const txtFileName = fileNames.find(name => name.endsWith('.txt'));

                if (txtFileName) {
                    const chatFile = zip.file(txtFileName);
                    const text = await chatFile.async("string");
                    const name = entry.name.replace("WhatsApp Chat with ", "").replace(".zip", "");
                    
                    globalChats[name] = parseChat(text);
                }
            }
        }
        
        if (Object.keys(globalChats).length > 0) {
            dashboardView.classList.remove('active');
            dashboardView.classList.add('hidden');
            chatView.classList.remove('hidden');
            chatView.classList.add('active');
            
            renderSidebar();
        } else {
            alert("No valid .zip exports found in that folder.");
        }
        
        loadBtn.innerHTML = originalHTML;
        loadBtn.disabled = false;

    } catch (err) {
        console.error(err);
        loadBtn.innerHTML = '<i class="fa-solid fa-file-zipper"></i> Select Archive Folder';
        loadBtn.disabled = false;
    }
});

// ==========================================
// 4. UI RENDERING & ADVANCED SEARCH
// ==========================================
function renderSidebar(filterType = 'all') {
    chatListEl.innerHTML = ''; 
    const names = Object.keys(globalChats);

    names.forEach(name => {
        const chatData = globalChats[name];
        
        // Filter Logic
        if (filterType === 'groups' && !chatData.isGroup) return;

        const div = document.createElement('div');
        div.className = 'chat-item';
        div.dataset.name = name; // Store original name for search reference
        
        const initials = name.substring(0, 2).toUpperCase();
        const msgs = chatData.messages;
        let lastMsgText = msgs.length > 0 ? msgs[msgs.length - 1].content : "No messages parsed";

        div.innerHTML = `
            <div class="chat-item-avatar">${initials}</div>
            <div class="chat-item-info">
                <div class="chat-item-name">${name}</div>
                <div class="chat-item-preview">${lastMsgText}</div>
            </div>
        `;
        
        div.addEventListener('click', () => {
            activeChatId = name;
            inChatSearchContainer.style.display = 'none'; // Close search on new chat
            inChatSearchInput.value = '';
            toggleInChatSearch.style.display = 'block'; // Show magnifying glass
            renderMessages(name, initials);
        });
        chatListEl.appendChild(div);
    });
}

// Sidebar Smart Highlight Search
searchInput.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const chatItems = document.querySelectorAll('.chat-item');
    
    chatItems.forEach(item => {
        const originalName = item.dataset.name;
        const nameContainer = item.querySelector('.chat-item-name');
        
        if (originalName.toLowerCase().includes(searchTerm) && searchTerm !== '') {
            item.style.display = 'flex';
            // Regex to highlight the matching letters anywhere in the word
            const regex = new RegExp(`(${searchTerm})`, 'gi');
            nameContainer.innerHTML = originalName.replace(regex, '<span class="highlight">$1</span>');
        } else if (searchTerm === '') {
            item.style.display = 'flex';
            nameContainer.textContent = originalName; // Reset
        } else {
            item.style.display = 'none';
        }
    });
});

// Filter Pill Clicks
document.getElementById('filterAll').addEventListener('click', (e) => {
    document.getElementById('filterGroups').classList.remove('active');
    e.target.classList.add('active');
    renderSidebar('all');
});
document.getElementById('filterGroups').addEventListener('click', (e) => {
    document.getElementById('filterAll').classList.remove('active');
    e.target.classList.add('active');
    renderSidebar('groups');
});

// Render Chat Messages
function renderMessages(chatName, initials, highlightTerm = '') {
    chatHeaderEl.innerHTML = `
        <div class="header-left">
            <div class="avatar-placeholder chat-item-avatar" style="margin:0;">${initials}</div>
            <h2 class="chat-title">${chatName}</h2>
        </div>
        <div class="header-actions">
            <i class="fa-solid fa-magnifying-glass" id="toggleInChatSearchInner" style="cursor:pointer;"></i>
        </div>
    `;
    
    // Reattach listener for the new header icon
    document.getElementById('toggleInChatSearchInner').addEventListener('click', () => {
        inChatSearchContainer.style.display = 'flex';
        inChatSearchInput.focus();
    });

    const messages = globalChats[chatName].messages;
    let htmlContent = '';
    
    messages.forEach(msg => {
        // In-Chat Search filtering
        if (highlightTerm && !msg.content.toLowerCase().includes(highlightTerm.toLowerCase())) {
            return; // Skip messages that don't match the search
        }

        const alignClass = msg.isMe ? 'me' : '';
        const senderHtml = msg.isMe ? '' : `<div class="msg-sender">${msg.sender}</div>`;
        
        let formattedContent = msg.content.replace(/\n/g, '<br>');
        
        // Apply highlight to message text if searching
        if (highlightTerm) {
            const regex = new RegExp(`(${highlightTerm})`, 'gi');
            formattedContent = formattedContent.replace(regex, '<span class="highlight">$1</span>');
        }

        htmlContent += `
            <div class="message ${alignClass}">
                ${senderHtml}
                <div>${formattedContent} <span class="msg-time">${msg.time}</span></div>
            </div>
        `;
    });
    
    if (htmlContent === '') {
        htmlContent = `<div class="empty-state-chat"><p>No messages match "${highlightTerm}"</p></div>`;
    }

    messageAreaEl.innerHTML = htmlContent;
    messageAreaEl.scrollTop = messageAreaEl.scrollHeight;
}

// In-Chat Search Listeners
inChatSearchInput.addEventListener('input', (e) => {
    if (activeChatId) {
        const initials = activeChatId.substring(0, 2).toUpperCase();
        renderMessages(activeChatId, initials, e.target.value);
    }
});

closeInChatSearch.addEventListener('click', () => {
    inChatSearchContainer.style.display = 'none';
    inChatSearchInput.value = '';
    if (activeChatId) {
        const initials = activeChatId.substring(0, 2).toUpperCase();
        renderMessages(activeChatId, initials); // Re-render without filter
    }
});