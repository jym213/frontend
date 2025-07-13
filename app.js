document.addEventListener('DOMContentLoaded', () => {
    // --- 全局状态和常量 ---
    const API_BASE_URL = 'http://127.0.0.1:8000';
    let state = {
        token: localStorage.getItem('sql_token'),
        user: null,
        currentMode: null,
        currentQuestionId: null,
    };

    // --- 启动时检查登录状态 ---
    if (!state.token) {
        window.location.href = 'login.html';
        return;
    }

    // --- DOM 元素获取 ---
    const chatBox = document.getElementById('chat-box');
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const explainBtn = document.getElementById('explain-btn');
    const testBtn = document.getElementById('test-btn');
    const dailyBtn = document.getElementById('daily-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const usernameDisplay = document.getElementById('username-display');
    const pointsDisplay = document.getElementById('points-display');
    const schemaDisplay = document.getElementById('schema-display');
    const leaderboardDisplay = document.getElementById('leaderboard-display');
    const llmSelect = document.getElementById('llm-select');
    const changePasswordBtn = document.getElementById('change-password-btn');
    // --- API 调用封装 ---
    async function apiCall(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json' };
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }
        const options = { method, headers };
        if (body) {
            options.body = JSON.stringify(body);
        }
        try {
            const response = await fetch(API_BASE_URL + endpoint, options);
            if (response.status === 401) {
                handleLogout();
                return;
            }
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
            }
            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error('API Call Error:', error);
            throw error;
        }
    }

    // --- UI 渲染函数 ---
    function appendMessage(sender, content, type = 'text') {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('chat-message', sender);
        if (type === 'html') {
            messageDiv.innerHTML = content;
        } else {
            const p = document.createElement('p');
            p.textContent = content;
            messageDiv.appendChild(p);
        }
        chatBox.appendChild(messageDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function updateUserInfo() {
        if (state.user) {
            usernameDisplay.textContent = state.user.username;
            pointsDisplay.textContent = state.user.points;
        }
    }

    async function updateLeaderboard() {
        try {
            const leaderboard = await apiCall('/daily/leaderboard');
            if (!leaderboard) return;
            leaderboardDisplay.innerHTML = leaderboard.map(entry =>
                `<p>${entry.rank}. ${entry.username} - ${entry.points}分</p>`
            ).join('');
        } catch (error) {
            leaderboardDisplay.innerHTML = '<p>无法加载排行榜。</p>';
        }
    }

    async function fetchAndDisplaySchema() {
        try {
            const schema = await apiCall('/test/schema');
            if (!schema) return;
            schemaDisplay.textContent = schema;
        } catch (error) {
            schemaDisplay.textContent = '无法加载表结构。';
        }
    }

    // --- 业务逻辑和事件处理 ---
    async function initializeApp() {
        try {
            state.user = await apiCall('/auth/users/me');
            if (state.user) {
                updateUserInfo();
                fetchAndDisplaySchema();
                updateLeaderboard();
                appendMessage('system', `你好, ${state.user.username}！请选择一个功能开始学习。`);
            }
        } catch (error) {
            console.error("Initialization failed, likely bad token.", error);
            handleLogout();
        }
    }

        // --- 业务逻辑和事件处理 (新增一个事件监听) ---
    function handleLogout() {
        localStorage.removeItem('sql_token');
        window.location.href = 'login.html';
    }
    logoutBtn.addEventListener('click', handleLogout);

    // 新增: 跳转到修改密码页面
    changePasswordBtn.addEventListener('click', () => {
        window.location.href = 'change-password.html';
    });

    function setMode(mode) {
        state.currentMode = mode;
        const buttons = [explainBtn, testBtn, dailyBtn];
        buttons.forEach(btn => btn.classList.remove('active'));
        if (mode === 'explain') {
            explainBtn.classList.add('active');
            chatInput.placeholder = '输入你想了解的SQL知识点...';
        } else if (mode === 'test') {
            testBtn.classList.add('active');
            chatInput.placeholder = '输入要测试的知识点 (用逗号分隔)...';
        } else if (mode === 'daily') {
            dailyBtn.classList.add('active');
            chatInput.placeholder = '点击下方按钮获取每日一题, 然后在此输入SQL答案...';
        }
    }

    explainBtn.addEventListener('click', () => setMode('explain'));
    testBtn.addEventListener('click', () => setMode('test'));
    dailyBtn.addEventListener('click', async () => {
        setMode('daily');
        appendMessage('bot', '正在获取每日一题...');
        try {
            const question = await apiCall('/daily/question');
            if(!question) return;
            state.currentQuestionId = question.id;
            appendMessage('system', `题目: ${question.question_text}`);
        } catch (error) {
            appendMessage('bot', `获取每日一题失败: ${error.message}`);
        }
    });

    sendBtn.addEventListener('click', async () => {
        const input = chatInput.value.trim();
        if (!input) return;
        if (!state.currentMode) {
            appendMessage('bot', '请先选择一个功能模式 (讲解、测试、每日一题)。');
            return;
        }
        appendMessage('user', input);
        chatInput.value = '';
        try {
            switch (state.currentMode) {
                case 'explain':
                    await handleExplain(input);
                    break;
                case 'test':
                    state.currentQuestionId ? await handleTestSubmit(input) : await handleTestGenerate(input);
                    break;
                case 'daily':
                    state.currentQuestionId ? await handleDailySubmit(input) : appendMessage('bot', '请先点击"每日一题"按钮获取题目。');
                    break;
            }
        } catch (error) {
            appendMessage('bot', `操作失败: ${error.message}`);
        }
    });

    async function handleExplain(topic) {
        const selectedLlm = llmSelect.value;
        appendMessage('bot', `正在用 ${selectedLlm} 查询关于 "${topic}" 的解释...`);

        const botMessageDiv = document.createElement('div');
        botMessageDiv.classList.add('chat-message', 'bot');
        const contentP = document.createElement('p');
        botMessageDiv.appendChild(contentP);
        chatBox.appendChild(botMessageDiv);

        let fullContent = '';
        try {
            const response = await fetch(API_BASE_URL + '/chat/explain', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.token}`
                },
                body: JSON.stringify({ topic, llm_provider: selectedLlm })
            });
            if (!response.ok) throw new Error(`服务器错误: ${response.status}`);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                fullContent += chunk;
                contentP.textContent = fullContent;
                chatBox.scrollTop = chatBox.scrollHeight;
            }
            contentP.innerHTML = marked.parse(fullContent);
        } catch (error) {
            contentP.textContent = `请求失败: ${error.message}`;
        }
    }

    async function handleTestGenerate(topicsInput) {
        const selectedLlm = llmSelect.value;
        appendMessage('bot', `正在根据知识点 "${topicsInput}" 生成题目...`);
        const topics = topicsInput.split(',').map(t => t.trim());
        const response = await apiCall('/test/generate-question', 'POST', { topics, llm_provider: selectedLlm });
        if (response) {
            state.currentQuestionId = response.question_id;
            appendMessage('system', `题目: ${response.question_text}`);
            chatInput.placeholder = '请在此输入你的SQL答案...';
        }
    }

    async function handleTestSubmit(sql) {
        const selectedLlm = llmSelect.value;
        appendMessage('bot', `正在评测你的SQL答案...`);
        const body = {
            question_id: state.currentQuestionId,
            user_sql: sql,
            llm_provider: selectedLlm
        };
        const response = await apiCall('/test/submit-answer', 'POST', body);
        if (response) {
            let content = `<h4>评测结果: ${response.message}</h4>`;
            if (response.analysis) {
                content += `<p><strong>AI导师分析:</strong></p><pre>${response.analysis}</pre>`;
            }
            appendMessage('bot', content, 'html');
        }
        state.currentQuestionId = null;
        chatInput.placeholder = '输入要测试的知识点 (用逗号分隔)...';
    }

    async function handleDailySubmit(sql) {
        appendMessage('bot', `正在提交每日一题答案...`);
        const body = { question_id: state.currentQuestionId, user_sql: sql };
        const response = await apiCall('/daily/submit', 'POST', body);
        if (response) {
            appendMessage('bot', response.message);
            // 【重要修改】只有在回答正确或题目已被解决时，才清除题目ID
            if (response.status === 'correct' || response.status === 'already_solved') {
                state.currentQuestionId = null;
                // 回答正确时，刷新用户信息和排行榜
                if (response.status === 'correct') {
                    state.user = await apiCall('/auth/users/me');
                    updateUserInfo();
                    updateLeaderboard();
                }
            }
        }
    }

    // --- 初始化 App ---
    initializeApp();
});
