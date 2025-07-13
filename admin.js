document.addEventListener('DOMContentLoaded', () => {
    // --- 全局状态和API封装 ---
    const API_BASE_URL = 'http://127.0.0.1:8000';
    const token = localStorage.getItem('sql_token');

    if (!token) {
        window.location.href = 'login.html';
        return;
    }

    async function apiCall(endpoint, method = 'GET', body = null) {
        const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(API_BASE_URL + endpoint, options);
        if (response.status === 401 || response.status === 403) {
            handleLogout();
            return null;
        }
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'API请求失败');
        }
        return response.json();
    }

    // --- DOM元素 ---
    const adminUsername = document.getElementById('admin-username');
    const logoutBtn = document.getElementById('logout-btn');
    const changePasswordBtn = document.getElementById('change-password-btn');
    const userTableBody = document.querySelector('#user-table tbody');
    const aiGenerateBtn = document.getElementById('ai-generate-btn');
    const publishBtn = document.getElementById('publish-btn');

    // --- 页面初始化 ---
    async function initializeAdminPage() {
        try {
            const user = await apiCall('/auth/users/me');
            if (!user || !user.is_admin) { // 双重验证，确保是管理员
                handleLogout();
                return;
            }
            adminUsername.textContent = user.username;
            loadUsers();
        } catch (error) {
            console.error(error);
            alert('无法加载管理员信息');
        }
    }

    // --- 用户管理 ---
    async function loadUsers() {
        try {
            const users = await apiCall('/admin/users');
            userTableBody.innerHTML = '';
            users.forEach(user => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.points}</td>
                    <td>
                        <input type="checkbox" data-userid="${user.id}" ${user.is_admin ? 'checked' : ''} ${user.id === 1 ? 'disabled' : ''}>
                    </td>
                `;
                userTableBody.appendChild(row);
            });
        } catch (error) {
            alert('加载用户列表失败: ' + error.message);
        }
    }

    userTableBody.addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox') {
            const userId = parseInt(e.target.dataset.userid, 10);
            const isAdmin = e.target.checked;
            try {
                await apiCall('/admin/users/permissions', 'PUT', { user_id: userId, is_admin: isAdmin });
                alert('权限更新成功！');
            } catch (error) {
                alert('权限更新失败: ' + error.message);
                e.target.checked = !isAdmin; // 恢复原状
            }
        }
    });

    // --- 每日一题发布 ---
    aiGenerateBtn.addEventListener('click', async () => {
        const topicsInput = document.getElementById('ai-topics').value;
        if (!topicsInput) {
            alert('请输入知识点！');
            return;
        }
        aiGenerateBtn.textContent = '生成中...';
        aiGenerateBtn.disabled = true;
        try {
            const topics = topicsInput.split(',').map(t => t.trim());
            const question = await apiCall('/admin/daily-question/ai-generate', 'POST', { topics });

            document.getElementById('question-title').value = '';
            document.getElementById('question-text').value = question.question;
            document.getElementById('correct-sql').value = question.sql;
            document.getElementById('ai-result').style.display = 'block';

        } catch (error) {
            alert('AI生成题目失败: ' + error.message);
        } finally {
            aiGenerateBtn.textContent = 'AI 生成题目';
            aiGenerateBtn.disabled = false;
        }
    });

    publishBtn.addEventListener('click', async () => {
        const title = document.getElementById('question-title').value;
        const question_text = document.getElementById('question-text').value;
        const correct_sql = document.getElementById('correct-sql').value;

        if (!title || !question_text || !correct_sql) {
            alert('请填写所有字段！');
            return;
        }

        publishBtn.textContent = '发布中...';
        publishBtn.disabled = true;
        try {
            await apiCall('/admin/daily-question/publish', 'POST', { title, question_text, correct_sql });
            alert('每日一题发布成功！');
             document.getElementById('ai-result').style.display = 'none';
        } catch (error) {
            alert('发布失败: ' + error.message);
        } finally {
            publishBtn.textContent = '确认发布';
            publishBtn.disabled = false;
        }
    });


    // --- 登出 ---
    function handleLogout() {
        localStorage.removeItem('sql_token');
        window.location.href = 'login.html';
    }
    logoutBtn.addEventListener('click', handleLogout);

    // 新增: 跳转到修改密码页面
    changePasswordBtn.addEventListener('click', () => {
        window.location.href = 'change-password.html';
    });

    initializeAdminPage();
});
