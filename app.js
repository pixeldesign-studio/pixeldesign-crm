/**
 * ============================================================
 * PIXELDESIGN CRM — app.js
 * Bước 1: Google Auth + Phân quyền + Menu skeleton
 * ============================================================
 */

const App = {

  // ──────────────────────────────────────────────────────────
  // STATE
  // ──────────────────────────────────────────────────────────
  session:     null,
  tokenClient: null,
  currentPage: 'don-hang',


  // ──────────────────────────────────────────────────────────
  // BOOTSTRAP
  // ──────────────────────────────────────────────────────────

  /**
   * Điểm khởi đầu của app.
   * Được gọi sau khi cả DOM lẫn Google GSI script đã sẵn sàng.
   */
  init() {
    // Thử khôi phục session từ localStorage
    this.session = this._loadSession();

    // Kiểm tra session còn hạn VÀ đúng scope version
    // Nếu scopes đã thay đổi (SCOPE_VERSION tăng), buộc đăng nhập lại
    // để lấy token mới với đủ quyền truy cập
    const scopeOk = this.session?.scopeVersion === CONFIG.SCOPE_VERSION;

    if (this.session && !this._isTokenExpired() && scopeOk) {
      console.log('[Auth] Session còn hạn và đúng scope version, bỏ qua đăng nhập.');
      this._batDauGiuPhien();
      this._renderApp();
    } else {
      if (this.session && !scopeOk) {
        console.log(`[Auth] Scope version cũ (${this.session?.scopeVersion}) < hiện tại (${CONFIG.SCOPE_VERSION}). Xoá session, yêu cầu đăng nhập lại.`);
      }
      this._clearSession();
      this._showLogin();
      this._initGoogleTokenClient();
    }
  },

  /**
   * Gọi khi người dùng bấm nút "Đăng nhập với Google".
   */
  signIn() {
    if (!this.tokenClient) {
      // GSI script chưa load xong, thử khởi tạo lại
      this._initGoogleTokenClient();
      if (!this.tokenClient) {
        this._showLoginError('Google Script chưa sẵn sàng. Vui lòng thử lại sau giây lát.');
        return;
      }
    }
    this._hideLoginError();
    this.tokenClient.requestAccessToken();
  },

  /**
   * Đăng xuất: thu hồi token, xóa session, về màn login.
   */
  signOut() {
    if (this.session?.accessToken) {
      try {
        google.accounts.oauth2.revoke(this.session.accessToken, () => {
          console.log('[Auth] Token đã được thu hồi.');
        });
      } catch (e) {
        // Ignore nếu token đã hết hạn
      }
    }
    this._clearSession();
    this.tokenClient = null;

    // Reset UI
    document.getElementById('app-shell').classList.add('hidden');
    this._showLogin();
    this._resetLoginButton();
    this._hideLoginError();
    this._initGoogleTokenClient();
  },

  /**
   * Xử lý user menu (click vào avatar/tên ở bottom sidebar).
   * Hiện tại chỉ show tooltip/info, có thể mở rộng sau.
   */
  showUserMenu(event) {
    // Không làm gì thêm ở bước 1 (nút đăng xuất đã riêng)
  },


  // ──────────────────────────────────────────────────────────
  // NAVIGATION
  // ──────────────────────────────────────────────────────────

  /**
   * Chuyển trang.
   * @param {string} page - ID trang (vd: 'don-hang', 'kanban')
   */
  navigateTo(page) {
    if (!this.session) return;

    const { role } = this.session;
    const adminSaleOnlyPages = ['doanh-thu', 'don-hang', 'cong-no', 'hieu-suat-sale'];
    const adminDesignerOnlyPages = ['hieu-suat'];
    
    if (adminSaleOnlyPages.includes(page) && role !== CONFIG.ROLES.ADMIN && role !== CONFIG.ROLES.SALE) {
      this._showToast('Bạn không có quyền truy cập trang này.', 'error');
      return;
    }

    if (adminDesignerOnlyPages.includes(page) && role !== CONFIG.ROLES.ADMIN && role !== CONFIG.ROLES.DESIGNER) {
      this._showToast('Bạn không có quyền truy cập trang này.', 'error');
      return;
    }

    this.currentPage = page;

    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });

    const config = this._getPageMeta(page);
    document.getElementById('page-title').textContent    = config.title;
    document.getElementById('page-subtitle').textContent = config.subtitle;
    document.getElementById('page-actions').innerHTML    = '';

    // Dispatch sang page renderer riêng, placeholder cho các trang chưa build
    switch (page) {
      case 'don-hang':
        this.renderDonHangPage();
        break;
      case 'kanban':
        this.renderKanbanPage();
        break;
      case 'khach-hang':
        this.renderKhachHangPage();
        break;
      case 'doanh-thu':
        this.renderDoanhThuPage();
        break;
      case 'cong-no':
        this.renderCongNoPage();
        break;
      case 'bang-luong':
        this.renderBangLuongPage();
        break;
      case 'hieu-suat':
        this.renderHieuSuatPage();
        break;
      case 'hieu-suat-sale':
        this.renderHieuSuatSalePage();
        break;
      default:
        document.getElementById('page-content').innerHTML = this._buildPlaceholder(config);
    }
  },

  /**
   * Metadata cho từng trang (tiêu đề, mô tả, icon).
   */
  _getPageMeta(page) {
    const map = {
      'don-hang':       { title: 'Lên đơn',              subtitle: 'Tạo và quản lý đơn hàng mới',         icon: '📋', color: '#8A724C' },
      'kanban':         { title: 'Kanban',                subtitle: 'Theo dõi tiến độ công việc theo cột',  icon: '📌', color: '#9C7E5E' },
      'khach-hang':     { title: 'Khách hàng',            subtitle: 'Quản lý thông tin liên hệ và lịch sử', icon: '👤', color: '#9C7E5E' },
      'doanh-thu':      { title: 'Doanh thu Pixel',       subtitle: 'Báo cáo doanh thu từ đơn hàng',       icon: '💰', color: '#A07840' },
      'cong-no':        { title: 'Công nợ',               subtitle: 'Tổng hợp danh sách các đơn còn nợ',    icon: '💸', color: '#B4453C' },
      'bang-luong':     { title: 'Bảng lương',            subtitle: 'Quản lý bảng lương nhân sự',          icon: '💰', color: '#27ae60' },
      'hieu-suat':      { title: 'Hiệu suất Designer',    subtitle: 'Báo cáo kết quả làm việc của designer',icon: '📊', color: '#27ae60' },
      'hieu-suat-sale': { title: 'Hiệu suất Sale',        subtitle: 'Báo cáo doanh số và hiệu suất của sale', icon: '📈', color: '#27ae60' },
    };
    return map[page] || { title: page, subtitle: '', icon: '📄', color: '#8A724C' };
  },

  /**
   * Build HTML placeholder cho trang chưa có nội dung.
   */
  _buildPlaceholder({ title, subtitle, icon }) {
    return `
      <div class="placeholder-card">
        <div class="placeholder-icon">${icon}</div>
        <h2>${title}</h2>
        <p>${subtitle}<br/>Nội dung màn hình này sẽ được phát triển ở bước tiếp theo.</p>
        <div class="placeholder-badge">🚧 Đang phát triển</div>
      </div>
    `;
  },


  // ──────────────────────────────────────────────────────────
  // GOOGLE OAUTH — Token Client (Implicit Grant)
  // ──────────────────────────────────────────────────────────

  _initGoogleTokenClient() {
    if (typeof google === 'undefined' || !google?.accounts?.oauth2) {
      console.warn('[Auth] Google GSI chưa sẵn sàng.');
      return;
    }

    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.CLIENT_ID,
      scope:     CONFIG.SCOPES,
      callback:  (response) => this._handleTokenResponse(response),
    });

    console.log('[Auth] Token client khởi tạo thành công.');
  },

  /**
   * Callback nhận access_token từ Google.
   */
  async _handleTokenResponse(response) {
    // Co token moi ve bang BAT KY duong nao -> go tam che "Phien da het han".
    // Neu khong, tam che nam de len tren app da chay lai, nguoi dung tuong hong.
    try {
      if (response?.access_token) document.getElementById('lop-phien-het')?.remove();
    } catch (e) {}
    // ── Nhanh LAM MOI NGAM: chi thay token moi, KHONG chay lai quy trinh dang nhap
    if (this._dangLamMoiNgam) {
      const xong = this._dangLamMoiNgam;
      this._dangLamMoiNgam = null;
      if (response.error || !response.access_token) {
        console.warn('[Auth] Làm mới ngầm thất bại:', response.error || 'không có token');
        xong(false);
        return;
      }
      const hanMoi = Date.now() + ((parseInt(response.expires_in) || 3600) * 1000);
      this.session = { ...this.session, accessToken: response.access_token, tokenExpiry: hanMoi };
      this._saveSession(this.session);
      console.log('[Auth] Đã làm mới phiên ngầm, hạn mới:', new Date(hanMoi).toLocaleTimeString('vi-VN'));
      xong(true);
      return;
    }

    if (response.error) {
      console.error('[Auth] Lỗi OAuth:', response);
      const messages = {
        'access_denied':  'Bạn đã từ chối quyền truy cập.',
        'popup_closed':   'Cửa sổ đăng nhập bị đóng. Vui lòng thử lại.',
        'popup_failed_to_open': 'Không thể mở cửa sổ đăng nhập. Hãy bật pop-up cho trang này.',
      };
      this._showLoginError(messages[response.error] || `Lỗi đăng nhập: ${response.error}`);
      this._resetLoginButton();
      return;
    }

    const accessToken = response.access_token;
    const expiresIn   = parseInt(response.expires_in) || 3600;

    try {
      // Bước 1: Lấy thông tin người dùng Google
      this._setLoginLoading('Đang xác thực tài khoản...');
      const userInfo = await this._fetchUserInfo(accessToken);
      console.log('[Auth] Người dùng:', userInfo.email);

      // Bước 2: Đọc tab NHAN_SU từ Sheets để tra vai trò
      this._setLoginLoading('Đang kiểm tra quyền truy cập...');
      const staffList = await this._readSheet(accessToken, CONFIG.SHEETS.NHAN_SU);

      // Bước 3: Đối chiếu email
      const staffRecord = this._findByEmail(staffList, userInfo.email);

      if (!staffRecord) {
        this._resetLoginButton();
        this._showLoginError(
          `Email "${userInfo.email}" không có trong hệ thống.\nVui lòng liên hệ Admin để được cấp quyền.`
        );
        return;
      }

      // Bước 4: Kiểm tra vai trò hợp lệ
      const role = (staffRecord.vai_tro || '').toLowerCase().trim();
      const validRoles = Object.values(CONFIG.ROLES);
      if (!validRoles.includes(role)) {
        this._resetLoginButton();
        this._showLoginError(`Vai trò "${staffRecord.vai_tro}" không hợp lệ. Liên hệ Admin.`);
        return;
      }

      // Bước 5: Lưu session (kèm scopeVersion để phát hiện token cũ thiếu quyền)
      const session = {
        email:        userInfo.email,
        name:         userInfo.name  || staffRecord.ten || 'Người dùng',
        picture:      userInfo.picture || null,
        role:         role,
        ten:          staffRecord.ten || userInfo.name || '',
        accessToken:  accessToken,
        tokenExpiry:  Date.now() + expiresIn * 1000,
        scopeVersion: CONFIG.SCOPE_VERSION, // dùng để phát hiện token cũ thiếu quyền
      };
      this._saveSession(session);

      console.log(`[Auth] Đăng nhập thành công. Vai trò: ${role}`);

      // Bước 6: Render app
      this._batDauGiuPhien();
      this._renderApp();

    } catch (err) {
      console.error('[Auth] Lỗi xử lý:', err);
      this._resetLoginButton();
      this._showLoginError(`Có lỗi xảy ra: ${err.message}`);
    }
  },


  // ──────────────────────────────────────────────────────────
  // GOOGLE APIs
  // ──────────────────────────────────────────────────────────

  /**
   * Lấy thông tin profile của người dùng đang đăng nhập.
   */
  async _fetchUserInfo(accessToken) {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`userinfo API lỗi: ${res.status} ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Helper: Trả về Spreadsheet ID đúng theo tab dữ liệu
   */
  _getSpreadsheetIdFor(sheetName) {
    if ([CONFIG.SHEETS.GIAO_DICH_TIEN, CONFIG.SHEETS.TIEN_DON].includes(sheetName)) {
      return CONFIG.FINANCE_SPREADSHEET_ID;
    }
    if ([CONFIG.SHEETS.CAU_HINH_LUONG, CONFIG.SHEETS.THUONG_RIENG].includes(sheetName)) {
      return CONFIG.PAYROLL_SPREADSHEET_ID;
    }
    return CONFIG.SPREADSHEET_ID;
  },

  /**
   * Đọc toàn bộ dữ liệu một tab trong Google Sheets.
   * Trả về mảng object { header: value }.
   *
   * @param {string} accessToken
   * @param {string} sheetName  - Tên tab (vd: 'NHAN_SU')
   * @param {string} [range]    - Range bổ sung, mặc định là toàn bộ sheet
   * @returns {Promise<Object[]>}
   */
  async _readSheet(accessToken, sheetName, range = '', customSpreadsheetId = null, laLanThu2 = false) {
    // Bao dam token con song truoc khi goi
    if (!accessToken) await this._baoDamConPhien();

    const token    = accessToken || this.session?.accessToken;
    const fullRange = range ? `${sheetName}!${range}` : sheetName;
    const targetSpreadsheetId = customSpreadsheetId || this._getSpreadsheetIdFor(sheetName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(fullRange)}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // 401 = token het han -> lam moi ngam roi THU LAI MOT LAN
    if (res.status === 401 && !laLanThu2) {
      console.warn('[Auth] Sheets trả 401, thử làm mới phiên rồi gọi lại...');
      const ok = await this._lamMoiPhienNgam();
      if (ok) return this._readSheet(null, sheetName, range, customSpreadsheetId, true);
      this._phienDaHet();
      throw new Error('Phiên đăng nhập đã hết hạn.');
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = errBody.error?.message || detail;
      } catch (_) {}

      // Xử lý êm lỗi 403 (Permission Denied) đối với các file tài chính
      // Trường hợp này xảy ra khi tài khoản (vd: Designer) không được cấp quyền đọc file tài chính
      if (res.status === 403 && targetSpreadsheetId === CONFIG.FINANCE_SPREADSHEET_ID) {
        console.warn(`[TÀI CHÍNH] Không có quyền truy cập tab ${sheetName} (Lỗi 403). Bỏ qua dữ liệu này thay vì báo lỗi.`);
        return []; // Trả về mảng rỗng để phần còn lại của app không bị crash
      }

      throw new Error(`Không thể đọc Sheet "${sheetName}": ${detail}`);
    }

    const data = await res.json();
    return this._parseSheet(data.values || []);
  },

  /**
   * Ghi dữ liệu vào một vùng trong Google Sheets.
   *
   * @param {string} sheetName
   * @param {string} range       - VD: 'A2:D2'
   * @param {Array[]} values     - Mảng 2 chiều
   * @returns {Promise<Object>}
   */
  async _writeSheet(sheetName, range, values, customSpreadsheetId = null) {
    const token    = this.session?.accessToken;
    const fullRange = `${sheetName}!${range}`;
    const targetSpreadsheetId = customSpreadsheetId || this._getSpreadsheetIdFor(sheetName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(fullRange)}?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method:  'PUT',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range: fullRange, majorDimension: 'ROWS', values }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = errBody.error?.message || detail;
      } catch (_) {}
      throw new Error(`Không thể ghi Sheet "${sheetName}": ${detail}`);
    }

    return res.json();
  },

  /**
   * Append (thêm dòng mới) vào cuối một Sheet.
   *
   * @param {string} sheetName
   * @param {Array[]} values - Mảng 2 chiều
   * @returns {Promise<Object>}
   */
  async _appendSheet(sheetName, values, customSpreadsheetId = null) {
    const token = this.session?.accessToken;
    const range = `${sheetName}!A1`;
    const targetSpreadsheetId = customSpreadsheetId || this._getSpreadsheetIdFor(sheetName);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const res = await fetch(url, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = errBody.error?.message || detail;
      } catch (_) {}
      throw new Error(`Không thể append Sheet "${sheetName}": ${detail}`);
    }

    return res.json();
  },

  /**
   * Lấy ID bằng số (sheetId) của một tab dựa trên Tên tab
   */
  async _getSheetId(spreadsheetId, sheetTitle) {
    const token = this.session?.accessToken;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(sheetId,title)`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (!res.ok) {
      console.error('_getSheetId error:', await res.text());
      return null;
    }
    
    const data = await res.json();
    const sheet = data.sheets?.find(s => s.properties?.title === sheetTitle);
    
    if (sheet && sheet.properties && sheet.properties.sheetId !== undefined) {
      return sheet.properties.sheetId;
    }
    
    console.error(`Không tìm thấy sheetTitle = ${sheetTitle} trong spreadsheet ${spreadsheetId}`);
    return null;
  },

  /**
   * Xóa cứng 1 dòng khỏi Google Sheet bằng batchUpdate
   */
  async _deleteSheetRow(spreadsheetId, sheetId, rowIndex0based) {
    const token = this.session?.accessToken;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    
    const requestBody = {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: sheetId,
              dimension: "ROWS",
              startIndex: rowIndex0based,
              endIndex: rowIndex0based + 1
            }
          }
        }
      ]
    };
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = errBody.error?.message || detail;
      } catch (_) {}
      throw new Error(`Lỗi xóa dòng: ${detail}`);
    }
    
    return res.json();
  },

  /**
   * Xóa cứng NHIỀU dòng khỏi Google Sheet bằng 1 batchUpdate
   */
  async _deleteMultipleSheetRows(spreadsheetId, sheetId, rowIndexArray) {
    if (!rowIndexArray || rowIndexArray.length === 0) return 0;

    const token = this.session?.accessToken;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    
    // Sắp xếp giảm dần (xóa từ dưới lên để không làm lệch index của các dòng phía trên)
    const sortedIndices = [...rowIndexArray].sort((a, b) => b - a);

    const requests = sortedIndices.map(rowIndex => ({
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: rowIndex,
          endIndex: rowIndex + 1
        }
      }
    }));

    const requestBody = { requests };
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        detail = errBody.error?.message || detail;
      } catch (_) {}
      throw new Error(`Lỗi xóa nhiều dòng: ${detail}`);
    }
    
    return sortedIndices.length;
  },

  /**
   * Xóa toàn bộ dữ liệu 1 đơn ở file crm-data (DON_HANG, DIEM_XU_LY, v.v.)
   */
  async _xoaDonCrmData(maDon) {
    if (!maDon) throw new Error('Cần cung cấp mã đơn để xóa.');
    const maDonTrim = String(maDon).trim();

    const tabsToClear = [
      CONFIG.SHEETS.DON_HANG,
      CONFIG.SHEETS.DIEM_XU_LY,
      CONFIG.SHEETS.DIEM_DESIGNER,
      CONFIG.SHEETS.COMMENT,
      CONFIG.SHEETS.NHAN_DON
    ];

    console.log(`[XÓA ĐƠN] Bắt đầu xóa dữ liệu đơn ${maDonTrim} ở CRM-DATA...`);

    const spreadsheetId = CONFIG.SPREADSHEET_ID; // CRM-DATA
    const token = this.session?.accessToken;
    
    const report = {};

    for (const tab of tabsToClear) {
      report[tab] = 0;
      try {
        // 1. Tải tab qua Google Sheets API
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) continue; // Nếu lỗi (VD tab không tồn tại) bỏ qua
        
        const data = await res.json();
        const values = data.values || [];
        
        if (values.length < 2) continue; // Không có dữ liệu (chỉ có header)
        
        // 2. Tìm tất cả rowIndex (0-based) có Cột A khớp maDon
        const indicesToDelete = [];
        // values[0] là header, data bắt đầu từ i = 1
        for (let i = 1; i < values.length; i++) {
          const row = values[i];
          if (row && row.length > 0) {
            const colA = String(row[0] || '').trim();
            if (colA === maDonTrim) {
               indicesToDelete.push(i);
            }
          }
        }
        
        if (indicesToDelete.length === 0) {
           console.log(`[XÓA ĐƠN] Tab ${tab}: Không có dòng nào khớp ${maDonTrim}.`);
           continue;
        }

        // 3. Lấy sheetId của tab
        const sheetId = await this._getSheetId(spreadsheetId, tab);
        if (sheetId === null || sheetId === undefined) {
           console.warn(`[XÓA ĐƠN] Tab ${tab}: Không tìm thấy sheetId.`);
           continue;
        }

        // 4. Xóa bằng _deleteMultipleSheetRows
        const deletedCount = await this._deleteMultipleSheetRows(spreadsheetId, sheetId, indicesToDelete);
        report[tab] = deletedCount;
        console.log(`[XÓA ĐƠN] Tab ${tab}: Đã xóa ${deletedCount} dòng.`);
      } catch (err) {
        console.error(`[XÓA ĐƠN] Lỗi khi xử lý tab ${tab}:`, err);
      }
    }
    
    console.log(`[XÓA ĐƠN] Hoàn tất xóa crm-data cho đơn ${maDonTrim}. Báo cáo:`, report);
    return report;
  },

  /**
   * Xóa toàn bộ dữ liệu 1 đơn ở file TAI-CHINH (GIAO_DICH_TIEN, TIEN_DON)
   */
  async _xoaDonTaiChinh(maDon) {
    if (!maDon) throw new Error('Cần cung cấp mã đơn để xóa.');
    const maDonTrim = String(maDon).trim();

    const tabsToClear = [
      CONFIG.SHEETS.GIAO_DICH_TIEN,
      CONFIG.SHEETS.TIEN_DON
    ];

    console.log(`[XÓA ĐƠN] Bắt đầu xóa dữ liệu đơn ${maDonTrim} ở TAI-CHINH...`);

    const spreadsheetId = CONFIG.FINANCE_SPREADSHEET_ID; // TAI-CHINH
    const token = this.session?.accessToken;
    
    const report = {};

    for (const tab of tabsToClear) {
      report[tab] = 0;
      try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tab)}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) continue;
        
        const data = await res.json();
        const values = data.values || [];
        
        if (values.length < 2) continue;
        
        const indicesToDelete = [];
        for (let i = 1; i < values.length; i++) {
          const row = values[i];
          if (row && row.length > 0) {
            const colA = String(row[0] || '').trim();
            if (colA === maDonTrim) {
               indicesToDelete.push(i);
            }
          }
        }
        
        if (indicesToDelete.length === 0) {
           console.log(`[XÓA ĐƠN] Tab ${tab}: Không có dòng nào khớp ${maDonTrim}.`);
           continue;
        }

        const sheetId = await this._getSheetId(spreadsheetId, tab);
        if (sheetId === null || sheetId === undefined) {
           console.warn(`[XÓA ĐƠN] Tab ${tab}: Không tìm thấy sheetId.`);
           continue;
        }

        const deletedCount = await this._deleteMultipleSheetRows(spreadsheetId, sheetId, indicesToDelete);
        report[tab] = deletedCount;
        console.log(`[XÓA ĐƠN] Tab ${tab}: Đã xóa ${deletedCount} dòng.`);
      } catch (err) {
        console.error(`[XÓA ĐƠN] Lỗi khi xử lý tab ${tab}:`, err);
      }
    }
    
    console.log(`[XÓA ĐƠN] Hoàn tất xóa TAI-CHINH cho đơn ${maDonTrim}. Báo cáo:`, report);
    return report;
  },

  /**
   * Xóa CỨNG hoàn toàn 1 đơn trên mọi file và dọn dẹp cache UI
   */
  async _xoaDon(maDon) {
    if (!maDon) return;
    const maDonTrim = String(maDon).trim();
    console.log(`[XÓA ĐƠN] Đang thực thi xóa cứng đơn ${maDonTrim} toàn hệ thống...`);

    try {
      // 0. Xử lý gỡ liên kết đơn con
      const donConList = (this._danhSachDon || []).filter(d => d.don_cha === maDonTrim);
      if (donConList.length > 0) {
        console.log(`[XÓA ĐƠN] Bắt đầu gỡ liên kết cho ${donConList.length} đơn con...`);
        const hRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`, { headers: { Authorization: `Bearer ${this.session?.accessToken}` } });
        if (hRes.ok) {
           const hData = await hRes.json();
           const headers = (hData.values || [[]])[0] || [];
           const dcIdx = headers.findIndex(h => h.trim() === 'don_cha');
           if (dcIdx >= 0) {
              const getColL = (i) => {
                 let l = ''; let n = i;
                 while (n >= 0) { l = String.fromCharCode((n % 26) + 65) + l; n = Math.floor(n / 26) - 1; }
                 return l;
              };
              const dcCol = getColL(dcIdx);
              const allRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG)}`, { headers: { Authorization: `Bearer ${this.session?.accessToken}` } });
              if (allRes.ok) {
                 const allData = await allRes.json();
                 const allRows = allData.values || [];
                 const p = [];
                 donConList.forEach(con => {
                    const rIdx = allRows.findIndex(r => String(r[0] || '').trim() === con.ma_don);
                    if (rIdx >= 0) {
                       const rNum = rIdx + 1;
                       p.push(this._writeSheet(CONFIG.SHEETS.DON_HANG, `${dcCol}${rNum}`, [['']]));
                       con.don_cha = ''; // Update cache bộ nhớ
                    }
                 });
                 if (p.length > 0) await Promise.all(p);
                 console.log(`[XÓA ĐƠN] Đã gỡ liên kết cha-con thành công.`);
              }
           }
        }
      }

      // 1. Xóa ở crm-data
      const crmReport = await this._xoaDonCrmData(maDonTrim);
      // 2. Xóa ở TAI-CHINH
      const financeReport = await this._xoaDonTaiChinh(maDonTrim);

      // 3. Dọn dẹp cache
      if (this._danhSachDon) {
         this._danhSachDon = this._danhSachDon.filter(d => d.ma_don !== maDonTrim);
      }
      if (this._kanbanData) {
         this._kanbanData = this._kanbanData.filter(d => d.ma_don !== maDonTrim);
      }
      if (this._giaoDichTienList) {
         this._giaoDichTienList = this._giaoDichTienList.filter(g => g.ma_don !== maDonTrim);
      }
      if (this._commentList) {
         this._commentList = this._commentList.filter(c => c.ma_don !== maDonTrim);
      }
      if (this._diemXuLy) {
         this._diemXuLy = this._diemXuLy.filter(d => d.ma_don !== maDonTrim);
      }
      if (this._nhanDonList) {
         this._nhanDonList = this._nhanDonList.filter(n => n.ma_don !== maDonTrim);
      }

      console.log(`[XÓA ĐƠN] Đã xóa hoàn toàn đơn ${maDonTrim} khỏi Google Sheets và Cache.`);
      return { crmReport, financeReport };
    } catch (err) {
      console.error(`[XÓA ĐƠN] Lỗi khi xóa đơn ${maDonTrim}:`, err);
      throw err;
    }
  },

  /**
   * Lưu hoặc cập nhật tong_gia_tri vào tab TIEN_DON (Tài chính).
   * @param {string} maDon 
   * @param {number} tongGiaTri 
   */
  async _saveTienDon(maDon, tongGiaTri) {
    if (!this.session?.accessToken || this.session.role === CONFIG.ROLES.DESIGNER) return;
    try {
      const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => []);
      const index = (rows || []).findIndex(r => r.ma_don === maDon);
      if (index >= 0) {
        const rowNum = index + 2; // header is row 1
        await this._writeSheet(CONFIG.SHEETS.TIEN_DON, `B${rowNum}`, [[tongGiaTri || 0]]);
      } else {
        await this._appendSheet(CONFIG.SHEETS.TIEN_DON, [[maDon, tongGiaTri || 0]]);
      }
    } catch (err) {
      console.warn('Lỗi khi lưu TIEN_DON:', err.message);
    }
  },

  /**
   * Chuyển mảng 2 chiều từ Sheets API thành mảng object.
   * Hàng đầu tiên là tên cột.
   */
  _parseSheet(values) {
    if (!values || values.length < 1) return [];
    const headers = values[0];
    if (values.length < 2) return [];
    return values.slice(1).map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h.trim()] = (row[i] !== undefined) ? String(row[i]).trim() : '';
      });
      return obj;
    });
  },

  /**
   * Tìm nhân sự theo email (case-insensitive).
   */
  _findByEmail(list, email) {
    const target = (email || '').toLowerCase().trim();
    return list.find(r => (r.email || '').toLowerCase().trim() === target) || null;
  },


  // ──────────────────────────────────────────────────────────
  // UI: APP RENDER
  // ──────────────────────────────────────────────────────────

  /**
   * Render toàn bộ app sau khi xác thực xong.
   */
  async _renderApp() {
    const { name, picture, role } = this.session;

    // Ẩn login, hiện app
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');

    // Avatar
    const avatarEl = document.getElementById('user-avatar');
    if (picture) {
      avatarEl.innerHTML = `<img src="${picture}" alt="${this._escHtml(name)}" referrerpolicy="no-referrer" />`;
    } else {
      avatarEl.innerHTML = `<span>${(name || '?').charAt(0).toUpperCase()}</span>`;
    }

    // Tên & vai trò
    document.getElementById('user-name').textContent = name;
    document.getElementById('user-role').innerHTML   = this._buildRoleChip(role);

    // Áp dụng phân quyền menu
    this._applyRolePermissions(role);

    // Init token client cho những lần sau (token refresh)
    if (!this.tokenClient) this._initGoogleTokenClient();

    // Điều hướng đến trang mặc định
    if (role === CONFIG.ROLES.DESIGNER) {
      this.navigateTo('kanban');
    } else {
      this.navigateTo('don-hang');
    }
    this._showToast(`Chào mừng trở lại, ${name.split(' ').pop()}! 👋`, 'success');
  },

  /**
   * Ẩn/hiện các mục menu theo vai trò.
   * Các element có `data-role="admin"` chỉ admin mới thấy.
   */
  _applyRolePermissions(role) {
    document.querySelectorAll('[data-role="admin"]').forEach(el => {
      const isVisible = (role === CONFIG.ROLES.ADMIN);
      el.style.display = isVisible ? '' : 'none';
    });
    document.querySelectorAll('[data-role="admin-sale"]').forEach(el => {
      const isVisible = (role === CONFIG.ROLES.ADMIN || role === CONFIG.ROLES.SALE);
      el.style.display = isVisible ? '' : 'none';
    });
    document.querySelectorAll('[data-role="admin-designer"]').forEach(el => {
      const isVisible = (role === CONFIG.ROLES.ADMIN || role === CONFIG.ROLES.DESIGNER);
      el.style.display = isVisible ? '' : 'none';
    });
    // Tab sang app ETSY: CHI nhung email khai trong CONFIG.ETSY_USERS (admin khong thay)
    const myEmail = (this.session?.email || '').toLowerCase().trim();
    const etsyList = (CONFIG.ETSY_USERS || []).map(e => (e || '').toLowerCase().trim());
    document.querySelectorAll('[data-role="etsy"]').forEach(el => {
      const isVisible = etsyList.includes(myEmail);
      el.style.display = isVisible ? '' : 'none';
    });
  },

  /**
   * Build HTML badge vai trò.
   */
  _buildRoleChip(role) {
    const labels = {
      admin:    '👑 Admin',
      sale:     '💼 Sale',
      designer: '🎨 Designer',
    };
    return `<span class="role-chip ${role}">${labels[role] || role}</span>`;
  },


  // ──────────────────────────────────────────────────────────
  // UI: LOGIN SCREEN
  // ──────────────────────────────────────────────────────────

  _showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app-shell').classList.add('hidden');
  },

  _setLoginLoading(msg) {
    const btn = document.getElementById('login-btn');
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> ${this._escHtml(msg)}`;
  },

  _resetLoginButton() {
    const btn = document.getElementById('login-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" class="google-icon">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Đăng nhập với Google`;
  },

  _showLoginError(msg) {
    const el = document.getElementById('login-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  },

  _hideLoginError() {
    const el = document.getElementById('login-error');
    if (el) el.classList.add('hidden');
  },


  // ──────────────────────────────────────────────────────────
  // UI: TOAST
  // ──────────────────────────────────────────────────────────

  _showToast(msg, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity    = '0';
      toast.style.transform  = 'translateX(20px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },


  // ──────────────────────────────────────────────────────────
  // SESSION MANAGEMENT
  // ──────────────────────────────────────────────────────────

  _saveSession(session) {
    try {
      localStorage.setItem('pixeldesign_session', JSON.stringify(session));
      this.session = session;
    } catch (e) {
      console.error('[Session] Không thể lưu session:', e);
    }
  },

  _loadSession() {
    try {
      const raw = localStorage.getItem('pixeldesign_session');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  _clearSession() {
    try { localStorage.removeItem('pixeldesign_session'); } catch (_) {}
    this.session = null;
  },

  // ──────────────────────────────────────────────────────────
  // GIU PHIEN DANG NHAP — tu gia han, khong bat dang nhap lai
  // Token Google chi song ~1 tieng. requestAccessToken({prompt:'', hint:email})
  // xin token moi gan nhu khong hien popup (co nhay qua roi tu dong).
  // ──────────────────────────────────────────────────────────

  async _lamMoiPhienNgam(imLang = true) {
    if (this._huaLamMoi) return this._huaLamMoi;

    this._huaLamMoi = new Promise((resolve) => {
      if (!this.tokenClient) this._initGoogleTokenClient();
      if (!this.tokenClient) { resolve(false); return; }

      let daXong = false;
      const xong = (ok) => { if (!daXong) { daXong = true; resolve(ok); } };
      this._dangLamMoiNgam = xong;

      try {
        // imLang=true  -> prompt:'' : khong hien gi (may tinh, Android)
        // imLang=false -> cho Google hien giao dien. CHI goi khi nguoi dung
        //                 vua CHAM, vi iOS chan cua so bat len neu khong co cu cham.
        const xinToken = imLang ? { prompt: '' } : {};
        if (this.session?.email) xinToken.hint = this.session.email;
        this.tokenClient.requestAccessToken(xinToken);
      } catch (e) {
        console.warn('[Auth] Không gọi được làm mới ngầm:', e.message);
        this._dangLamMoiNgam = null;
        xong(false);
      }
      // Im lang thi 20 giay la du. Nhung khi NGUOI DUNG tu cham nut, ho con phai
      // doc va chon tai khoan Google — 20 giay qua ngan. Het gio som se bao loi
      // oan, dong thoi lam token ve sau bi lac sang luong dang nhap moi.
      const hanCho = imLang ? 20000 : 5 * 60 * 1000;
      setTimeout(() => { this._dangLamMoiNgam = null; xong(false); }, hanCho);
    }).finally(() => { this._huaLamMoi = null; });

    return this._huaLamMoi;
  },

  async _baoDamConPhien() {
    if (!this._isTokenExpired()) return true;
    return await this._lamMoiPhienNgam();
  },

  /**
   * Phien het han. KHONG xoa session, KHONG da ra man dang nhap.
   * Hien mot lop phu ngay tren man dang xem, co nut de nguoi dung CHAM.
   * Cu cham do la thu iOS bat buoc phai co thi moi cho mo cua so Google.
   */
  _phienDaHet() {
    console.warn('[Auth] Phiên đã hết. Hiện bảng đăng nhập lại tại chỗ.');
    if (document.getElementById('lop-phien-het')) return;   // da hien roi

    const lop = document.createElement('div');
    lop.id = 'lop-phien-het';
    lop.style.cssText = 'position:fixed; inset:0; z-index:99999; display:flex;' +
      'align-items:center; justify-content:center; padding:24px;' +
      'background:rgba(43,35,24,0.55); backdrop-filter:blur(3px);';
    lop.innerHTML =
      '<div style="background:#FDFBF7; border-radius:18px; max-width:380px; width:100%;' +
      'padding:28px 24px; text-align:center; box-shadow:0 12px 40px rgba(0,0,0,0.28);">' +
        '<div style="font-size:38px; line-height:1; margin-bottom:14px;">🔒</div>' +
        '<div style="font-size:17px; font-weight:800; color:#2B2318; margin-bottom:8px;">' +
          'Phiên đăng nhập đã hết hạn</div>' +
        '<div style="font-size:13.5px; color:#6B5F52; line-height:1.6; margin-bottom:20px;">' +
          'Chạm nút bên dưới để tiếp tục. Bạn sẽ quay lại đúng màn hình đang xem, ' +
          'không mất dữ liệu nào.</div>' +
        '<button type="button" id="nut-dang-nhap-lai" ' +
          'style="width:100%; border:none; cursor:pointer; background:#8A724C; color:#fff;' +
          'font-size:15px; font-weight:700; padding:14px; border-radius:12px;">' +
          'Đăng nhập lại</button>' +
        '<div id="loi-dang-nhap-lai" style="font-size:12.5px; color:#B4453C; margin-top:12px; min-height:16px;"></div>' +
      '</div>';
    document.body.appendChild(lop);
    document.getElementById('nut-dang-nhap-lai')
      .addEventListener('click', () => this._dangNhapLaiTaiCho());
  },

  /**
   * Chay khi nguoi dung CHAM nut. Vi co cu cham nen iOS cho mo cua so Google.
   */
  async _dangNhapLaiTaiCho() {
    const nut  = document.getElementById('nut-dang-nhap-lai');
    const oLoi = document.getElementById('loi-dang-nhap-lai');
    // Huy lan cho cu (neu co) de moi lan cham la mot lan thu MOI thuc su,
    // khong bi ket vao lan cho truoc do.
    if (this._dangLamMoiNgam) {
      const cu = this._dangLamMoiNgam;
      this._dangLamMoiNgam = null;
      try { cu(false); } catch (e) {}
    }
    this._huaLamMoi = null;

    if (nut)  { nut.disabled = true; nut.textContent = 'Đang mở Google...'; }
    if (oLoi) oLoi.textContent = '';

    // Khi nguoi dung quay lai app (dong cua so Google, hoac chon xong tai khoan),
    // mo khoa nut de ho co the cham lai neu can. Khong cho du 5 phut.
    const moKhoaNut = () => {
      if (document.hidden) return;
      const n = document.getElementById('nut-dang-nhap-lai');
      if (n && n.disabled) { n.disabled = false; n.textContent = 'Thử lại'; }
    };
    document.addEventListener('visibilitychange', moKhoaNut);

    let ok = false;
    try { ok = await this._lamMoiPhienNgam(false); }   // false = cho Google hien giao dien
    finally { document.removeEventListener('visibilitychange', moKhoaNut); }

    if (ok) {
      document.getElementById('lop-phien-het')?.remove();
      try { if (this.currentPage) this.navigateTo(this.currentPage); } catch (e) {}
      try { (this._showToast || this.showToast)?.call(this, 'Đã kết nối lại', 'success', 2000); } catch (e) {}
      return;
    }

    if (nut)  { nut.disabled = false; nut.textContent = 'Thử lại'; }
    if (oLoi) oLoi.textContent = 'Chưa kết nối được. Chạm "Thử lại", hoặc mở app bằng trình duyệt Safari thay vì icon màn hình chính.';
  },

  _batDauGiuPhien() {
    if (this._daBatGiuPhien) return;
    this._daBatGiuPhien = true;

    setInterval(async () => {
      if (!this.session?.accessToken) return;
      if (document.hidden) return;
      if (this._isTokenExpired()) await this._lamMoiPhienNgam();
    }, 4 * 60 * 1000);

    // iPad/iPhone hay dong bang tab -> hen gio o tren ngung chay.
    // Khi quay lai phai kiem NGAY.
    document.addEventListener('visibilitychange', async () => {
      if (document.hidden) return;
      if (!this.session?.accessToken) return;
      if (!this._isTokenExpired()) return;
      const ok = await this._lamMoiPhienNgam();
      if (!ok) this._phienDaHet();
    });
  },

  _isTokenExpired() {
    if (!this.session?.tokenExpiry) return true;
    // Thêm buffer 60 giây để tránh token hết hạn giữa request
    return Date.now() >= (this.session.tokenExpiry - 60_000);
  },


  // ──────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────

  /** Escape HTML để tránh XSS */
  _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },


  // ════════════════════════════════════════════════════════════
  // MODULE: LÊN ĐƠN
  // ════════════════════════════════════════════════════════════

  async renderDonHangPage() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px 0;flex-direction:column;gap:16px;"><div class="spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(138,114,76,0.2);border-top-color:var(--clr-accent);"></div><p style="font-size:var(--font-size-sm);color:var(--clr-text-muted);">Đang tải dữ liệu...</p></div>`;

    // Tải song song danh sách đơn + nhân sự + khách hàng + danh mục
    let danhSachDon = [], nhanSuList = [], khachHangList = [];
    let danhMucNganh = [], danhMucItem = [];
    await Promise.allSettled([
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG)
        .then(r => { danhSachDon = (r || []).filter(d => d.da_an !== 'yes'); })
        .catch(e => console.warn('[DonHang]', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.NHAN_SU)
        .then(r => { nhanSuList = (r || []).filter(p => p.vai_tro === 'sale' || p.vai_tro === 'admin'); })
        .catch(e => console.warn('[NhanSu]', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I')
        .then(r => { khachHangList = r || []; })
        .catch(e => console.warn('[KhachHang]', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DANH_MUC_NGANH)
        .then(r => { danhMucNganh = r || []; })
        .catch(e => console.warn('[DanhMucNganh]', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DANH_MUC_ITEM)
        .then(r => { danhMucItem = r || []; })
        .catch(e => console.warn('[DanhMucItem]', e.message)),
    ]);

    this._danhMucNganh = danhMucNganh.map(r => (r.ten_nganh || '').trim()).filter(Boolean);
    this._danhMucItem = danhMucItem.map(r => (r.ten_item || '').trim()).filter(Boolean);

    this._danhSachDon  = danhSachDon;
    this._selectedFiles = [];
    this._loaiKhach    = 'moi';
    this._selectedMaKH = null;
    this._selectedTenKhach = null;

    this._khachHangList = khachHangList;

    // Danh sách khách hàng lấy trực tiếp từ KHACH_HANG
    this._uniqueKhachList = khachHangList.map(d => ({
      ma_kh: d.ma_kh,
      ten_khach: d.ten_khach || '',
      brand: d.brand || '',
      nganh: d.nganh || '',
      fanpage: d.facebook || '',
      zalo: d.zalo || '',
      sdt: d.sdt || ''
    })).sort((a, b) => a.ma_kh.localeCompare(b.ma_kh));


    // Build sale dropdown options — mặc định chọn người đang đăng nhập
    const tenDangNhap = this.session?.ten || this.session?.name || '';
    let saleOpts;
    if (nhanSuList.length > 0) {
      saleOpts = nhanSuList.map(p => {
        const ten = p.ten || p.ho_ten || p.name || '';
        const sel = ten === tenDangNhap ? ' selected' : '';
        return `<option value="${this._escHtml(ten)}"${sel}>${this._escHtml(ten)}</option>`;
      }).join('');
      // Nếu người đăng nhập không có trong danh sách, thêm vào đầu
      const hasCurrentUser = nhanSuList.some(p => (p.ten || p.ho_ten || p.name || '') === tenDangNhap);
      if (!hasCurrentUser && tenDangNhap) {
        saleOpts = `<option value="${this._escHtml(tenDangNhap)}" selected>${this._escHtml(tenDangNhap)}</option>` + saleOpts;
      }
    } else {
      saleOpts = `<option value="${this._escHtml(tenDangNhap)}" selected>${this._escHtml(tenDangNhap)}</option>`;
    }

    content.innerHTML = `<div class="page-form-container">


  <!-- ── Thông tin khách hàng ── -->
  <div class="form-section-card">
    <div class="form-section-header">
      <div class="form-section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
      <div><div class="form-section-title">Thông tin khách hàng</div><div class="form-section-subtitle">Chọn khách mới hoặc tìm khách đã có trong hệ thống</div></div>
    </div>

    <!-- Tab chọn loại khách -->
    <div class="khach-type-tabs">
      <button class="khach-tab-btn active" id="btn-khach-moi" onclick="App._chonLoaiKhach('moi')">+ Khách mới</button>
      <button class="khach-tab-btn" id="btn-khach-cu" onclick="App._chonLoaiKhach('cu')">&#128269; Khách cũ</button>
    </div>

    <!-- Khách mới -->
    <div id="section-khach-moi">
      <div class="form-info-note">Mã KH sẽ được tự động sinh (KH-0001, KH-0002...) và gắn với khách hàng này mãi mãi.</div>
      <div class="form-grid form-grid-1" style="margin-top:var(--space-3);">
        <div class="form-group">
          <label class="form-label" for="f-ten-khach">Tên khách hàng <span class="required">*</span></label>
          <input class="form-input" id="f-ten-khach" type="text" placeholder="Tên cá nhân hoặc doanh nghiệp" maxlength="100"/>
          <span class="form-error-msg hidden" id="err-ten-khach">Vui lòng nhập tên khách</span>
        </div>
      </div>
    </div>

    <!-- Khách cũ -->
    <div id="section-khach-cu" style="display:none;">
      <div class="form-group khach-search-wrapper">
        <label class="form-label" for="f-search-khach">Tìm khách hàng</label>
        <input class="form-input" id="f-search-khach" type="text" placeholder="Nhập tên hoặc mã KH..." oninput="App._timKhach(this.value)" autocomplete="off"/>
        <div id="khach-search-dropdown" class="khach-dropdown" style="display:none;"></div>
      </div>
      <div id="khach-da-chon" style="display:none;margin-top:var(--space-3);">
        <div class="khach-selected-card">
          <div style="display:flex;align-items:center;gap:var(--space-2);">
            <span class="khach-badge" id="selected-ma-kh-badge"></span>
            <span class="khach-selected-name" id="selected-ten-khach-display"></span>
          </div>
          <button class="btn-change-khach" onclick="App._xoaChonKhach()">&#10005; Đổi khách</button>
        </div>
      </div>
      <span class="form-error-msg hidden" id="err-khach-cu" style="margin-top:var(--space-2);display:block;">Vui lòng chọn khách hàng từ danh sách</span>
    </div>

    <!-- Brand + Ngành + Liên hệ (dùng chung cho cả 2 loại) -->
    <div class="form-grid form-grid-2" style="margin-top:var(--space-4);padding-top:var(--space-4);border-top:1px solid var(--clr-border-light);">
      <div class="form-group">
        <label class="form-label" for="f-brand">Brand</label>
        <input class="form-input" id="f-brand" type="text" placeholder="Tên thương hiệu" maxlength="100"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-nganh">Ngành</label>
        <input class="form-input" id="f-nganh" list="nganh-list" placeholder="Chọn hoặc gõ ngành mới..." autocomplete="off"/>
        <datalist id="nganh-list">
          ${this._danhMucNganh.map(n => `<option value="${this._escHtml(n)}"/>`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-fanpage">Tên/Link Fanpage</label>
        <input class="form-input" id="f-fanpage" type="text" placeholder="facebook.com/trangcuakhach" maxlength="200"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-zalo">Số Zalo</label>
        <input class="form-input" id="f-zalo" type="text" placeholder="09xxxxxxxx" maxlength="20"/>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-sdt">Số điện thoại</label>
        <input class="form-input" id="f-sdt" type="text" placeholder="09xxxxxxxx" maxlength="20"/>
      </div>
    </div>
  </div>

  <!-- ── Chi tiết đơn ── -->
  <div class="form-section-card">
    <div class="form-section-header">
      <div class="form-section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg></div>
      <div><div class="form-section-title">Chi tiết đơn hàng</div><div class="form-section-subtitle">Thông tin thiết kế và thời hạn thực hiện</div></div>
    </div>
    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label class="form-label" for="f-item">Item thiết kế</label>
        <input class="form-input" id="f-item" list="item-list" placeholder="Chọn hoặc gõ item mới..." autocomplete="off"/>
        <datalist id="item-list">
          ${this._danhMucItem.map(i => `<option value="${this._escHtml(i)}"/>`).join('')}
        </datalist>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-ngay-het-han">Ngày hết hạn</label>
        <input class="form-input" id="f-ngay-het-han" type="date"/>
      </div>
      <div class="form-group full-width">
        <label class="form-label" for="f-brief">Brief mô tả</label>
        <textarea class="form-textarea" id="f-brief" placeholder="Mô tả yêu cầu thiết kế: phong cách, màu sắc, kích thước, tham khảo..." rows="4"></textarea>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-sale">Sale phụ trách</label>
        <select class="form-select" id="f-sale">${saleOpts}</select>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-diem-don">Điểm đơn</label>
        <input class="form-input" id="f-diem-don" type="number" min="0" step="1" placeholder="Ví dụ: 10"/>
      </div>
    </div>
  </div>

  <!-- ── Tài chính ── -->
  <div class="form-section-card">
    <div class="form-section-header">
      <div class="form-section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
      <div><div class="form-section-title">Tài chính</div><div class="form-section-subtitle">Giá trị đơn và tiền cọc khách đặt lúc này</div></div>
    </div>
    <div class="form-grid form-grid-2">
      <div class="form-group">
        <label class="form-label" for="f-tong-gia-tri-display">Tổng giá trị đơn</label>
        <div class="money-input-wrapper">
          <input class="form-input" id="f-tong-gia-tri-display" type="text" inputmode="numeric" placeholder="0" autocomplete="off"
            oninput="App._formatMoneyInput(this,'f-tong-gia-tri')" onblur="App._formatMoneyInput(this,'f-tong-gia-tri')"/>
          <input type="hidden" id="f-tong-gia-tri" value="0"/>
          <span class="currency-symbol">VNĐ</span>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="f-coc-display">Tiền cọc lúc này</label>
        <div class="money-input-wrapper">
          <input class="form-input" id="f-coc-display" type="text" inputmode="numeric" placeholder="0 (để trống = chưa cọc)" autocomplete="off"
            oninput="App._formatMoneyInput(this,'f-coc')" onblur="App._formatMoneyInput(this,'f-coc')"/>
          <input type="hidden" id="f-coc" value="0"/>
          <span class="currency-symbol">VNĐ</span>
        </div>
      </div>
    </div>
    <div id="cong-no-preview" style="display:none;margin-top:12px;padding:10px 14px;background:var(--clr-bg);border-radius:var(--radius-sm);border:1px solid var(--clr-border-light);">
      <span style="font-size:var(--font-size-sm);color:var(--clr-text-muted);">Công nợ còn lại: </span>
      <strong id="cong-no-val" style="color:var(--clr-danger);">0 VNĐ</strong>
    </div>
  </div>

  <!-- ── Ảnh đính kèm ── -->
  <div class="form-section-card">
    <div class="form-section-header">
      <div class="form-section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>
      <div><div class="form-section-title">Ảnh đính kèm</div><div class="form-section-subtitle">Ảnh tham khảo, brief, mood board — upload lên Google Drive</div></div>
    </div>
    <div class="upload-zone" id="upload-zone">
      <input type="file" id="f-anh" multiple onchange="App._onAnhSelected(this)"/>
      <div class="upload-zone-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg></div>
      <p><strong>Click để chọn file</strong> hoặc kéo thả vào đây<small>Ảnh · PDF · Word · Excel · Video · ... · Tối đa 20 file</small></p>
    </div>
    <div id="upload-preview-grid" class="upload-preview-grid"></div>
    <div id="upload-progress-container" style="display:none;margin-top:12px;">
      <div class="upload-progress-bar"><div class="upload-progress-fill" id="upload-progress-fill" style="width:0%"></div></div>
      <p class="upload-status-text" id="upload-status-text">Đang chuẩn bị...</p>
    </div>
  </div>

  <!-- ── Đơn đặt thêm ── -->
  <div class="form-section-card">
    <div class="form-section-header" style="margin-bottom:var(--space-4);border-bottom:none;padding-bottom:0;">
      <div class="form-section-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></div>
      <div><div class="form-section-title">Đơn đặt thêm</div><div class="form-section-subtitle">Gắn đơn này với một đơn gốc (thiết kế bổ sung trong cùng dự án)</div></div>
    </div>
    <div class="toggle-row" id="toggle-don-them" onclick="App._toggleDonDatThem()" role="button" tabindex="0">
      <div class="toggle-switch"></div>
      <span class="toggle-label">Đây là đơn đặt thêm của khách cũ</span>
    </div>
    <div class="don-cha-section" id="don-cha-section">
      <div class="form-group" style="margin-top:var(--space-3);">
        <label class="form-label" for="f-don-cha">Chọn đơn gốc</label>
        ${danhSachDon.length > 0
          ? `<select class="form-select" id="f-don-cha"><option value="">— Chọn khách hàng trước —</option></select>`
          : `<div style="font-size:var(--font-size-sm);color:var(--clr-text-muted);padding:var(--space-3);background:var(--clr-bg);border-radius:var(--radius-sm);border:1px solid var(--clr-border-light);">Chưa có đơn nào để liên kết.</div>`}
      </div>
    </div>
  </div>

  <!-- ── Form Actions ── -->
  <div class="form-actions">
    <button class="btn btn-ghost" type="button" onclick="App._datLaiForm()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      Nhập lại
    </button>
    <button class="btn btn-primary btn-submit-don" id="btn-len-don" onclick="App.submitDonHang()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Lên đơn
    </button>
  </div>
  <div id="submit-result" style="display:none;"></div>

</div>`;

    this._setupUploadDragDrop();
    this._setupMoneyPreview();
    // Đóng dropdown khi click ra ngoài
    document.addEventListener('click', e => {
      if (!e.target.closest('.khach-search-wrapper')) {
        const dd = document.getElementById('khach-search-dropdown');
        if (dd) dd.style.display = 'none';
      }
    }, { once: false, capture: false });
  },


  _setupUploadDragDrop() {
    const zone = document.getElementById('upload-zone');
    if (!zone) return;
    zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', ()=> zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); this._addFiles(Array.from(e.dataTransfer.files)); });
  },

  _formatMoneyInput(displayEl, hiddenId) {
    // Lấy chỉ số
    const raw = displayEl.value.replace(/[^0-9]/g, '');
    const num = parseInt(raw, 10) || 0;
    // Hiển thị có dấu phẩy
    displayEl.value = raw === '' ? '' : num.toLocaleString('en-US');
    // Lưu số thuần vào hidden input
    const hidden = document.getElementById(hiddenId);
    if (hidden) hidden.value = num || 0;
    // Cập nhật preview công nợ
    this._updateCongNoPreview();
  },

  _formatGiamGiaInput(displayEl) {
    const loai = document.getElementById('det-giam-gia-loai')?.value || '';
    const hidden = document.getElementById('det-giam-gia-gia-tri-hidden');
    if (!hidden) return;

    if (loai === 'amount') {
       const raw = displayEl.value.replace(/[^0-9]/g, '');
       const num = parseInt(raw, 10) || 0;
       displayEl.value = raw === '' ? '' : num.toLocaleString('en-US');
       hidden.value = num || 0;
    } else if (loai === 'percent') {
       // Allow decimals for percent, e.g. 10.5
       const raw = displayEl.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
       // Clean up multiple dots
       const parts = raw.split('.');
       const clean = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
       displayEl.value = clean;
       hidden.value = clean;
    } else {
       displayEl.value = '';
       hidden.value = '';
    }
    this._updateGiamGiaPreview();
  },

  _updateGiamGiaPreview() {
    const previewEl = document.getElementById('det-giam-gia-preview');
    if (!previewEl) return;
    
    // Simulate a don object to use the existing helper
    const donSim = {
       tong_gia_tri: document.getElementById('det-tong-gia-tri-hidden')?.value || 0,
       giam_gia_loai: document.getElementById('det-giam-gia-loai')?.value || '',
       giam_gia_gia_tri: document.getElementById('det-giam-gia-gia-tri-hidden')?.value || ''
    };
    
    if (!donSim.giam_gia_loai) {
        document.getElementById('det-giam-gia-gia-tri').disabled = true;
        document.getElementById('det-giam-gia-gia-tri').value = '';
        document.getElementById('det-giam-gia-gia-tri-hidden').value = '';
        previewEl.innerHTML = '';
        return;
    }
    
    document.getElementById('det-giam-gia-gia-tri').disabled = false;
    
    const tienGiam = this._tinhSoTienGiam(donSim);
    const phaiThu = this._tinhSoPhaiThu(donSim);
    
    if (tienGiam > 0) {
        previewEl.innerHTML = `Số tiền giảm: ${tienGiam.toLocaleString('vi-VN')} ₫ &nbsp;|&nbsp; Số phải thu: <span style="color:var(--clr-success);">${phaiThu.toLocaleString('vi-VN')} ₫</span>`;
    } else {
        previewEl.innerHTML = '';
    }
  },

  _updateCongNoPreview() {
    const total = this._parseCurrency(document.getElementById('f-tong-gia-tri')?.value);
    const coc   = this._parseCurrency(document.getElementById('f-coc')?.value);
    const prev  = document.getElementById('cong-no-preview');
    const val   = document.getElementById('cong-no-val');
    if (!prev || !val) return;
    if (total > 0) {
      prev.style.display = 'block';
      const cn = total - coc;
      val.textContent = cn.toLocaleString('vi-VN') + ' VNĐ';
      val.style.color = cn > 0 ? 'var(--clr-danger)' : 'var(--clr-success)';
    } else { prev.style.display = 'none'; }
  },

  _setupMoneyPreview() {
    // Với money fields dạng text+hidden, chỉ cần lắng nghe hidden input change
    // Preview được gọi từ _formatMoneyInput nên không cần listener riêng
  },

  _onAnhSelected(input) { this._addFiles(Array.from(input.files)); input.value = ''; },

  _addFiles(newFiles) {
    if (!this._selectedFiles) this._selectedFiles = [];
    const max = 20, remaining = max - this._selectedFiles.length;
    const toAdd = newFiles.slice(0, remaining).map(f => ({ file: f, tenHienThi: f.name }));
    if (newFiles.length > remaining) this._showToast(`Tối đa ${max} file. Chỉ thêm ${toAdd.length} file đầu.`, 'warning');
    // Cảnh báo file > 25MB
    const MB25 = 25 * 1024 * 1024;
    const bigFiles = toAdd.filter(obj => obj.file.size > MB25).map(obj => obj.file.name);
    if (bigFiles.length > 0) {
      this._showToast(`⚠️ File quá lớn (>25MB), có thể upload chậm: ${bigFiles.slice(0,3).join(', ')}`, 'warning', 5000);
    }
    this._selectedFiles.push(...toAdd);
    this._renderPreviewGrid();
  },

  _xoaAnh(index) { if (!this._selectedFiles) return; this._selectedFiles.splice(index, 1); this._renderPreviewGrid(); },

  _updateSelectedFileName(index, newName) {
    if (!this._selectedFiles || !this._selectedFiles[index]) return;
    const nameStr = (newName || '').trim().replace(/[\n|]/g, ' ');
    this._selectedFiles[index].tenHienThi = nameStr || this._selectedFiles[index].file.name;
  },

  _renderPreviewGrid() {
    const grid = document.getElementById('upload-preview-grid');
    if (!grid) return;
    if (!this._selectedFiles?.length) { grid.innerHTML = ''; return; }
    grid.innerHTML = this._selectedFiles.map((item, i) => {
      const file = item.file;
      const isImg = file.type.startsWith('image/');
      const isVid = file.type.startsWith('video/');
      const isPdf = file.type === 'application/pdf';
      const isDoc = /\.(doc|docx)$/i.test(file.name);
      const isXls = /\.(xls|xlsx)$/i.test(file.name);
      const emoji = isPdf ? '📄' : isDoc ? '📝' : isXls ? '📊' : isVid ? '🎬' : '📎';
      const src   = isImg ? URL.createObjectURL(file) : '';
      const sizeMb = (file.size / 1024 / 1024).toFixed(1);
      const bigWarn = file.size > 25*1024*1024 ? ' style="border-color:#E67E22;"' : '';
      return `<div class="upload-preview-item"${bigWarn}>
        ${isImg ? `<img src="${src}" alt="${this._escHtml(item.tenHienThi)}" loading="lazy">` : `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:4px;"><span style="font-size:26px;">${emoji}</span><span style="font-size:9px;color:var(--clr-text-muted);">${sizeMb}MB</span></div>`}
        <div class="file-name" style="padding:0 2px;">
          <input type="text" value="${this._escHtml(item.tenHienThi)}" onchange="App._updateSelectedFileName(${i}, this.value)" style="width:100%; border:none; background:rgba(255,255,255,0.8); font-size:11px; padding:2px; border-radius:2px; text-align:center;" title="Sửa tên file">
        </div>
        <button class="remove-btn" onclick="App._xoaAnh(${i})" title="Xoá">✕</button>
      </div>`;
    }).join('');
  },

  _toggleDonDatThem() {
    const row = document.getElementById('toggle-don-them');
    const sec = document.getElementById('don-cha-section');
    if (!row || !sec) return;
    const on = row.classList.toggle('active');
    sec.classList.toggle('visible', on);
  },

  async submitDonHang() {
    // ── 1. Thu thập dữ liệu form cơ bản ──
    const brand         = document.getElementById('f-brand')?.value.trim() || '';
    const nganh         = document.getElementById('f-nganh')?.value || '';
    const item          = document.getElementById('f-item')?.value || '';
    const brief         = document.getElementById('f-brief')?.value.trim() || '';
    const ngayHetHanRaw = document.getElementById('f-ngay-het-han')?.value || '';
    const salePhuTrach  = document.getElementById('f-sale')?.value.trim() || '';
    const diemDonVal    = document.getElementById('f-diem-don')?.value.trim();
    const diemDon       = diemDonVal ? parseFloat(diemDonVal) : '';
    const tongGiaTri    = this._parseCurrency(document.getElementById('f-tong-gia-tri')?.value);
    const tiencoc       = this._parseCurrency(document.getElementById('f-coc')?.value);
    const isDonThem     = document.getElementById('toggle-don-them')?.classList.contains('active');
    const donCha        = isDonThem ? (document.getElementById('f-don-cha')?.value || '') : '';
    const congNo        = (tongGiaTri || 0) - tiencoc;
    const ngayHetHan    = this._formatDateFromInput(ngayHetHanRaw);
    const ngayLenDon    = this._formatDateToday();
    
    // Thu thập thêm thông tin liên hệ
    const fanpage = document.getElementById('f-fanpage')?.value.trim() || '';
    const zalo    = document.getElementById('f-zalo')?.value.trim() || '';
    const sdt     = document.getElementById('f-sdt')?.value.trim() || '';

    let loaiKhach = this._loaiKhach || 'moi';
    let maKh, tenKhach;

    if (loaiKhach === 'cu') {
      if (!this._selectedMaKH) {
        document.getElementById('err-khach-cu')?.classList.remove('hidden');
        this._showToast('Vui lòng chọn khách hàng từ danh sách.', 'error');
        return;
      }
      maKh     = this._selectedMaKH;
      tenKhach = this._selectedTenKhach;
    } else {
      tenKhach = document.getElementById('f-ten-khach')?.value.trim();
    }

    // ── 2. Validate Trường Bắt Buộc ──
    let hasErr = false;
    if (loaiKhach === 'moi' && !tenKhach) {
      document.getElementById('f-ten-khach')?.classList.add('error');
      document.getElementById('err-ten-khach')?.classList.remove('hidden');
      hasErr = true;
    } else if (loaiKhach === 'moi') {
      document.getElementById('f-ten-khach')?.classList.remove('error');
      document.getElementById('err-ten-khach')?.classList.add('hidden');
    }

    if (!item) {
      document.getElementById('f-item')?.classList.add('error');
      hasErr = true;
    } else {
      document.getElementById('f-item')?.classList.remove('error');
    }

    if (isNaN(tongGiaTri) || tongGiaTri <= 0 || document.getElementById('f-tong-gia-tri-display')?.value.trim() === '') {
      document.getElementById('f-tong-gia-tri-display')?.classList.add('error');
      hasErr = true;
    } else {
      document.getElementById('f-tong-gia-tri-display')?.classList.remove('error');
    }

    if (hasErr) {
      this._showToast('Vui lòng nhập đầy đủ các trường bắt buộc (Tên KH, Item, Tổng giá trị).', 'error');
      return;
    }

    // ── 3. Check Trùng Lặp (Khách Mới) ──
    if (loaiKhach === 'moi') {
      const tkLower = tenKhach.toLowerCase();
      const fpLower = fanpage.toLowerCase();
      const zlLower = zalo.toLowerCase();
      const sdLower = sdt.toLowerCase();

      const match = this._uniqueKhachList.find(k => 
        (tkLower && k.ten_khach && k.ten_khach.toLowerCase().trim() === tkLower) ||
        (fpLower && k.fanpage && k.fanpage.toLowerCase().trim() === fpLower) ||
        (zlLower && k.zalo && k.zalo.toLowerCase().trim() === zlLower) ||
        (sdLower && k.sdt && k.sdt.toLowerCase().trim() === sdLower)
      );

      if (match) {
        const msg = `Thông tin trùng với khách ${match.ma_kh} - ${match.ten_khach}.\nĐây có phải khách cũ không?`;
        const useCu = await this._showConfirm(msg, 'Dùng khách cũ này', 'Vẫn tạo khách mới');
        if (useCu) {
          maKh = match.ma_kh;
          tenKhach = match.ten_khach;
          loaiKhach = 'cu';
        }
      }
    }

    // ── 4. Lock nút ──
    const btn = document.getElementById('btn-len-don');
    const origHtml = btn?.innerHTML || '';
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Đang xử lý...`; }

    try {
      // Tự sinh mã đơn
      const maDon = await this._sinhMaDon();

      // ── Xử lý KHACH_HANG ──
      const khachHangData = [maKh, tenKhach, brand, nganh, fanpage, zalo, sdt, ngayLenDon, ''];
      
      if (loaiKhach === 'moi') {
        maKh = this._sinhMaKH();
        khachHangData[0] = maKh;
        await this._appendSheet(CONFIG.SHEETS.KHACH_HANG, [khachHangData]);
        if (this._uniqueKhachList) {
          this._uniqueKhachList.unshift({ ma_kh: maKh, ten_khach: tenKhach, brand, nganh, fanpage, zalo, sdt });
        }
      } else {
        // Cập nhật thông tin khách cũ vào KHACH_HANG nếu có thay đổi
        const oldKh = this._uniqueKhachList.find(k => k.ma_kh === maKh);
        if (oldKh) {
          const isChanged = oldKh.ten_khach !== tenKhach || oldKh.brand !== brand || oldKh.nganh !== nganh || oldKh.fanpage !== fanpage || oldKh.zalo !== zalo || oldKh.sdt !== sdt;
          if (isChanged) {
            const rawKH = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I').catch(() => []);
            const rowIndex = rawKH.findIndex(r => r.ma_kh === maKh);
            if (rowIndex >= 0) {
              const rowNum = rowIndex + 2; // +1 for header, +1 for 0-index
              const oldRow = rawKH[rowIndex];
              const updateData = [maKh, tenKhach, brand, nganh, fanpage, zalo, sdt, oldRow.ngay_tao || ngayLenDon, oldRow.ghi_chu || ''];
              await this._writeSheet(CONFIG.SHEETS.KHACH_HANG, `A${rowNum}:I${rowNum}`, [updateData]);
            }
            // Update local cache
            Object.assign(oldKh, { ten_khach: tenKhach, brand, nganh, fanpage, zalo, sdt });
          }
        }
      }

      // Upload ảnh nếu có
      let linkAnh = '';
      if (this._selectedFiles?.length > 0) {
        const prog = document.getElementById('upload-progress-container');
        if (prog) prog.style.display = 'block';
        linkAnh = await this._uploadAnhLenDrive(this._selectedFiles, maDon);
        if (prog) prog.style.display = 'none';
      }

      // Ghi DON_HANG (không cần lưu fanpage, zalo, sdt nữa, nhưng vẫn lưu để tương thích tạm thời hoặc bỏ trống)
      // Để tránh lỗi ở các phần khác chưa migrate xong, ta ghi rỗng hoặc ghi bình thường, 
      // Nhưng theo yêu cầu, ta lưu ở KHACH_HANG là nguồn chính. Mình vẫn giữ ghi DON_HANG để an toàn.
      // Fetch headers dynamically to ensure correct column order
      const headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
        { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
      );
      const hData = await headerRes.json();
      const headers = (hData.values || [[]])[0] || [];
      
      const newOrderRow = new Array(headers.length).fill('');
      const dataMap = {
        ma_don: maDon, ma_kh: maKh, ten_khach: tenKhach, brand: brand, nganh: nganh, item: item, brief: brief, link_anh: linkAnh,
        ngay_len_don: ngayLenDon, ngay_het_han: ngayHetHan, cot_kanban: 'Đơn mới', sale_phu_trach: salePhuTrach, diem_don: diemDon,
        tong_gia_tri: tongGiaTri || 0, tien_coc: tiencoc, tiencoc: tiencoc, cong_no: congNo, trang_thai: 'đang chạy', don_cha: donCha,
        fanpage: fanpage, zalo: zalo, sdt: sdt, ngay_duyet_mau: '', 
        ngay_thu_du: (tongGiaTri > 0 && tiencoc >= (tongGiaTri || 0)) ? ngayLenDon : ''
      };
      
      Object.entries(dataMap).forEach(([key, val]) => {
         const idx = headers.findIndex(h => h.trim() === key);
         if (idx !== -1) newOrderRow[idx] = val;
      });

      await this._appendSheet(CONFIG.SHEETS.DON_HANG, [newOrderRow]);

      // Ghi tong_gia_tri sang file Tài Chính (TIEN_DON)
      await this._saveTienDon(maDon, tongGiaTri || 0);

      // Thêm Ngành mới vào danh mục nếu chưa có
      if (nganh && this._danhMucNganh) {
        const nClean = nganh.trim();
        const nLower = nClean.toLowerCase();
        if (!this._danhMucNganh.some(x => x.toLowerCase() === nLower)) {
          const nCap = nClean.charAt(0).toUpperCase() + nClean.slice(1);
          await this._appendSheet(CONFIG.SHEETS.DANH_MUC_NGANH, [[nCap]]);
          this._danhMucNganh.push(nCap);
        }
      }

      // Thêm Item mới vào danh mục nếu chưa có
      if (item && this._danhMucItem) {
        const iClean = item.trim();
        const iLower = iClean.toLowerCase();
        if (!this._danhMucItem.some(x => x.toLowerCase() === iLower)) {
          const iCap = iClean.charAt(0).toUpperCase() + iClean.slice(1);
          await this._appendSheet(CONFIG.SHEETS.DANH_MUC_ITEM, [[iCap]]);
          this._danhMucItem.push(iCap);
        }
      }

      // Ghi GIAO_DICH_TIEN nếu có cọc: ma_don|ngay|loai|so_tien|nguon
      if (tiencoc > 0) {
        await this._appendSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, [[
          maDon, ngayLenDon, 'cọc', tiencoc, 'Pixel', this._taoIdGiaoDich()
        ]]);
      }

      const linkThe = `${window.location.origin}${window.location.pathname}#kanban?don=${encodeURIComponent(maDon)}`;
      const chatText = taoThongBaoChat(maDon, linkThe);

      this._hienThanhCong(maDon, tenKhach, tiencoc, congNo, chatText);
      this._showToast(`✅ Đã tạo đơn ${maDon} thành công!`, 'success', 4000);

      // Cập nhật cache local
      if (this._danhSachDon) this._danhSachDon.unshift({ ma_don: maDon, ma_kh: maKh, ten_khach: tenKhach, brand });

    } catch (err) {
      console.error('[DonHang] Lỗi lên đơn:', err);
      this._showToast(`Lỗi: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = origHtml; }
      const prog = document.getElementById('upload-progress-container');
      if (prog) prog.style.display = 'none';
    }
  },


  // ── Sinh mã đơn ──────────────────────────────────────────
  async _sinhMaDon() {
    const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
    if (!rows?.length) return 'DON-0001';
    let max = 0;
    rows.forEach(r => { const m = (r.ma_don||'').match(/DON-(\d+)$/); if (m) { const n = parseInt(m[1],10); if (n>max) max=n; } });
    return `DON-${String(max + 1).padStart(4, '0')}`;
  },

  // Sinh mã KH mới (dùng dữ liệu đã load trong bộ nhớ, KHÔNG gọi API)
  _sinhMaKH() {
    let max = 0;
    const allKhach = new Set();

    // 1. Quét từ bảng KHACH_HANG (ưu tiên)
    if (this._uniqueKhachList && this._uniqueKhachList.length > 0) {
       this._uniqueKhachList.forEach(k => {
          if (k.ma_kh) allKhach.add(String(k.ma_kh).trim());
       });
    }

    // 2. Quét từ bảng DON_HANG (phòng trường hợp đơn có mã nhưng khách chưa lưu)
    if (this._danhSachDon && this._danhSachDon.length > 0) {
       this._danhSachDon.forEach(d => {
          if (d.ma_kh) allKhach.add(String(d.ma_kh).trim());
       });
    }

    // Nếu không có bất kỳ dữ liệu khách nào
    if (allKhach.size === 0) return 'KH-0001';

    // 3. Tìm số thứ tự lớn nhất đang có
    allKhach.forEach(ma => {
       const m = ma.match(/KH-(\d+)$/);
       if (m) {
          const n = parseInt(m[1], 10);
          if (n > max) max = n;
       }
    });

    // 4. Vòng lặp an toàn sinh mã mới tuyệt đối không trùng
    let newMaKh = '';
    let loopCount = 0;
    while (loopCount < 1000) {
       max++;
       newMaKh = `KH-${String(max).padStart(4, '0')}`;
       if (!allKhach.has(newMaKh)) {
          break; // Đảm bảo mã này chưa từng xuất hiện ở bất kỳ đâu
       }
       loopCount++;
    }

    return newMaKh || 'KH-0001';
  },

  // ── Customer type selection ───────────────────────────────
  _chonLoaiKhach(loai) {
    const secMoi  = document.getElementById('section-khach-moi');
    const secCu   = document.getElementById('section-khach-cu');
    const btnMoi  = document.getElementById('btn-khach-moi');
    const btnCu   = document.getElementById('btn-khach-cu');
    if (!secMoi || !secCu) return;
    this._loaiKhach = loai;
    if (loai === 'moi') {
      secMoi.style.display = 'block'; secCu.style.display  = 'none';
      btnMoi?.classList.add('active'); btnCu?.classList.remove('active');
    } else {
      secMoi.style.display = 'none';  secCu.style.display  = 'block';
      btnMoi?.classList.remove('active'); btnCu?.classList.add('active');
    }
  },

  _timKhach(query) {
    const dd = document.getElementById('khach-search-dropdown');
    if (!dd) return;
    if (!query) { dd.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const matches = (this._uniqueKhachList || [])
      .filter(k => k.ten_khach.toLowerCase().includes(q) || k.ma_kh.toLowerCase().includes(q))
      .slice(0, 10);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map(k =>
      `<div class="khach-dropdown-item" onclick="App._chonKhachCu('${this._escHtml(k.ma_kh)}', '${this._escHtml(k.ten_khach)}')">
        <span class="khach-badge">${this._escHtml(k.ma_kh)}</span>
        <span>${this._escHtml(k.ten_khach)}</span>
      </div>`
    ).join('');
    dd.style.display = 'block';
  },

  _chonKhachCu(maKH, tenKhach) {
    this._selectedMaKH    = maKH;
    this._selectedTenKhach = tenKhach;
    const inp = document.getElementById('f-search-khach');
    if (inp) inp.value = '';
    const dd = document.getElementById('khach-search-dropdown');
    if (dd) dd.style.display = 'none';
    const badge = document.getElementById('selected-ma-kh-badge');
    const name  = document.getElementById('selected-ten-khach-display');
    if (badge) badge.textContent = maKH;
    if (name)  name.textContent  = tenKhach;
    const card = document.getElementById('khach-da-chon');
    if (card) card.style.display = 'block';
    document.getElementById('err-khach-cu')?.classList.add('hidden');

    // Tự động điền các trường dùng chung từ KHACH_HANG
    const kh = this._uniqueKhachList.find(k => k.ma_kh === maKH);
    if (kh) {
      if (document.getElementById('f-brand')) document.getElementById('f-brand').value = kh.brand || '';
      if (document.getElementById('f-nganh')) document.getElementById('f-nganh').value = kh.nganh || '';
      if (document.getElementById('f-fanpage')) document.getElementById('f-fanpage').value = kh.fanpage || '';
      if (document.getElementById('f-zalo')) document.getElementById('f-zalo').value = kh.zalo || '';
      if (document.getElementById('f-sdt')) document.getElementById('f-sdt').value = kh.sdt || '';
    }
    this._updateDonChaDropdown();
  },

  _xoaChonKhach() {
    this._selectedMaKH    = null;
    this._selectedTenKhach = null;
    const inp = document.getElementById('f-search-khach'); if (inp) inp.value = '';
    const card = document.getElementById('khach-da-chon'); if (card) card.style.display = 'none';
    const dd = document.getElementById('khach-search-dropdown'); if (dd) dd.style.display = 'none';

    // Xóa trắng các trường dùng chung
    if (document.getElementById('f-brand')) document.getElementById('f-brand').value = '';
    if (document.getElementById('f-nganh')) document.getElementById('f-nganh').value = '';
    if (document.getElementById('f-fanpage')) document.getElementById('f-fanpage').value = '';
    if (document.getElementById('f-zalo')) document.getElementById('f-zalo').value = '';
    if (document.getElementById('f-sdt')) document.getElementById('f-sdt').value = '';
    this._updateDonChaDropdown();
  },

  _updateDonChaDropdown() {
    const select = document.getElementById('f-don-cha');
    if (!select) return;

    if (!this._selectedMaKH) {
       select.innerHTML = '<option value="">— Chọn khách hàng trước —</option>';
       return;
    }

    const donCuaKhach = (this._danhSachDon || []).filter(d => d.ma_kh === this._selectedMaKH);
    
    if (donCuaKhach.length === 0) {
       select.innerHTML = '<option value="">— Khách này chưa có đơn để gắn —</option>';
       return;
    }

    const opts = donCuaKhach.map(d => {
       const parts = [];
       if (d.ma_don) parts.push(d.ma_don);
       if (d.item) parts.push(d.item);
       if (d.ngay_len_don) parts.push(d.ngay_len_don.substring(0, 5)); // Lấy DD/MM từ DD/MM/YYYY
       const info = parts.join(' · ');
       return `<option value="${this._escHtml(d.ma_don)}">${this._escHtml(info)}</option>`;
    }).join('');

    select.innerHTML = '<option value="">— Chọn đơn gốc —</option>' + opts;
  },



  async _uploadAnhLenDrive(files, maDon) {
    const PARENT_ID = '0AFQU89_y-KPRUk9PVA';
    const links = [];
    this._setUploadProgress(5, `Đang tạo thư mục ${maDon} trên Drive...`);
    const folder   = await this._taoThuMucDrive(maDon, PARENT_ID);
    const folderId = folder.id;
    for (let i = 0; i < files.length; i++) {
      const item = files[i];
      const file = item.file || item;
      const tenHienThi = item.tenHienThi || file.name;
      const safeName = tenHienThi.replace(/[\n|]/g, ' '); // Đảm bảo an toàn
      
      this._setUploadProgress(10 + Math.round((i / files.length) * 85), `Đang upload (${i+1}/${files.length}): ${safeName}`);
      try {
        const up = await this._uploadFileDrive(file, folderId);
        await this._setFilePermission(up.id).catch(()=>{});
        links.push(`https://drive.google.com/file/d/${up.id}/view|${safeName}`);
      } catch (e) { console.warn('[Drive] Upload lỗi:', file.name, e.message); links.push(`[Upload thất bại: ${safeName}]`); }
    }
    this._setUploadProgress(100, '✅ Upload hoàn tất!');
    return links.join('\n');
  },

  async _taoThuMucDrive(name, parentId) {
    const res = await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Tạo thư mục Drive lỗi ${res.status}`); }
    return res.json();
  },

  async _uploadFileDrive(file, folderId) {
    const boundary = 'pxd_' + Date.now();
    const meta = { name: file.name, parents: [folderId], mimeType: file.type || 'application/octet-stream' };
    const buf  = await file.arrayBuffer();
    const enc  = new TextEncoder();
    const pre  = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${file.type}\r\n\r\n`);
    const post = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(pre.length + buf.byteLength + post.length);
    body.set(pre, 0); body.set(new Uint8Array(buf), pre.length); body.set(post, pre.length + buf.byteLength);
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.session.accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error?.message || `Upload Drive ${res.status}`); }
    return res.json();
  },

  async _setFilePermission(fileId) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.session.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
  },

  _setUploadProgress(pct, text) {
    const fill = document.getElementById('upload-progress-fill');
    const txt  = document.getElementById('upload-status-text');
    if (fill) fill.style.width = `${pct}%`;
    if (txt)  txt.textContent  = text;
  },

  _hienThanhCong(maDon, tenKhach, tiencoc, congNo, chatText) {
    const result = document.getElementById('submit-result');
    if (!result) return;
    document.querySelectorAll('#page-content .form-section-card, #page-content .form-actions').forEach(el => el.style.display = 'none');
    result.style.display = 'block';
    const safeChat = this._escHtml(chatText);
    const jsonChat = JSON.stringify(chatText);
    result.innerHTML = `
      <div class="success-card">
        <div class="success-card-header">
          <div class="success-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <div>
            <div class="success-title">Đã tạo đơn ${this._escHtml(maDon)} thành công!</div>
            <div class="success-subtitle">Khách: <strong>${this._escHtml(tenKhach)}</strong> &nbsp;·&nbsp; Cọc: <strong>${tiencoc>0?tiencoc.toLocaleString('vi-VN')+' VNĐ':'Chưa cọc'}</strong> &nbsp;·&nbsp; Còn nợ: <strong>${congNo.toLocaleString('vi-VN')} VNĐ</strong></div>
          </div>
        </div>
        <div class="chat-notif-box">
          <div class="chat-notif-label">📣 Thông báo Google Chat</div>
          <div class="chat-notif-text">${safeChat}</div>
          <div class="chat-notif-actions">
            <button class="btn-copy" id="btn-copy-chat" onclick="App._copyToClipboard(${jsonChat}, 'btn-copy-chat')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
            <span style="font-size:var(--font-size-xs);color:var(--clr-text-muted);align-self:center;">Dán vào Google Chat để thông báo team</span>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-3);justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="App.renderDonHangPage()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Tạo đơn mới
          </button>
          <button class="btn btn-primary" onclick="App._donTiepChoKhach()">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            Lưu &amp; tạo đơn tiếp cho khách này
          </button>
        </div>
      </div>`;
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  // Giữ lại thông tin khách, chỉ reset phần chi tiết đơn
  _donTiepChoKhach() {
    // Lưu context khách hiện tại
    const loaiKhach     = this._loaiKhach;
    const selectedMaKH  = this._selectedMaKH;
    const selectedTen   = this._selectedTenKhach;
    const tenMoi = document.getElementById('f-ten-khach')?.value || '';
    const brand  = document.getElementById('f-brand')?.value || '';
    const nganh  = document.getElementById('f-nganh')?.value || '';

    // Ẩn success card, hiện lại form
    const result = document.getElementById('submit-result');
    if (result) result.style.display = 'none';
    document.querySelectorAll('#page-content .form-section-card, #page-content .form-actions').forEach(el => el.style.display = '');

    // Khôi phục thông tin khách
    if (loaiKhach === 'cu' && selectedMaKH) {
      this._chonLoaiKhach('cu');
      this._chonKhachCu(selectedMaKH, selectedTen);
    } else {
      this._chonLoaiKhach('moi');
      const tenEl = document.getElementById('f-ten-khach');
      if (tenEl) tenEl.value = tenMoi;
    }
    const brandEl = document.getElementById('f-brand');
    if (brandEl) brandEl.value = brand;
    const nganhEl = document.getElementById('f-nganh');
    if (nganhEl) nganhEl.value = nganh;

    // Chỉ reset phần chi tiết đơn + tài chính + file
    ['f-item','f-don-cha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const dt = document.getElementById('f-ngay-het-han'); if (dt) dt.value = '';
    const brief = document.getElementById('f-brief'); if (brief) brief.value = '';
    const tv = document.getElementById('f-tong-gia-tri-display'); if (tv) tv.value = '';
    const th = document.getElementById('f-tong-gia-tri'); if (th) th.value = '0';
    const cv = document.getElementById('f-coc-display'); if (cv) cv.value = '';
    const ch = document.getElementById('f-coc'); if (ch) ch.value = '0';
    const cn = document.getElementById('cong-no-preview'); if (cn) cn.style.display = 'none';
    document.getElementById('toggle-don-them')?.classList.remove('active');
    document.getElementById('don-cha-section')?.classList.remove('visible');
    this._selectedFiles = [];
    this._renderPreviewGrid();

    // Scroll lên đầu form
    document.querySelector('.page-form-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },

  async _copyToClipboard(text, btnId) {
    try {
      await navigator.clipboard.writeText(text);
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.classList.add('copied');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Đã copy!`;
        setTimeout(() => {
          btn.classList.remove('copied');
          btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"/></svg> Copy`;
        }, 2500);
      }
      this._showToast('Đã copy vào clipboard!', 'success');
    } catch { this._showToast('Không thể copy tự động — hãy copy thủ công.', 'error'); }
  },

  _datLaiForm() {
    // Reset thông tin khách hàng
    this._loaiKhach       = 'moi';
    this._selectedMaKH    = null;
    this._selectedTenKhach = null;
    this._chonLoaiKhach('moi');
    const tenEl = document.getElementById('f-ten-khach'); if (tenEl) tenEl.value = '';
    const searchEl = document.getElementById('f-search-khach'); if (searchEl) searchEl.value = '';
    const cardEl = document.getElementById('khach-da-chon'); if (cardEl) cardEl.style.display = 'none';
    const ddEl = document.getElementById('khach-search-dropdown'); if (ddEl) ddEl.style.display = 'none';

    // Reset các field còn lại
    ['f-brand','f-brief'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['f-nganh','f-item','f-don-cha'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const dt = document.getElementById('f-ngay-het-han'); if (dt) dt.value = '';
    // Reset money fields (text display + hidden)
    ['f-tong-gia-tri-display','f-coc-display'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['f-tong-gia-tri','f-coc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = '0'; });
    document.querySelectorAll('.form-error-msg').forEach(e => e.classList.add('hidden'));
    document.querySelectorAll('.form-input.error,.form-select.error,.form-textarea.error').forEach(e => e.classList.remove('error'));
    document.getElementById('toggle-don-them')?.classList.remove('active');
    document.getElementById('don-cha-section')?.classList.remove('visible');
    const cn = document.getElementById('cong-no-preview'); if (cn) cn.style.display = 'none';
    this._selectedFiles = [];
    this._renderPreviewGrid();
  },


  // ════════════════════════════════════════════════════════════
  //  MÀN HÌNH KHÁCH HÀNG
  // ════════════════════════════════════════════════════════════

  async _syncKhachHang(event) {
    let btn = null;
    let oldText = '';
    if (event && event.currentTarget) {
      btn = event.currentTarget;
      oldText = btn.innerText;
      btn.innerText = 'Đang đồng bộ...';
      btn.disabled = true;
    }
    try {
      const [donRows, khRows] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I')
      ]);

      const existingKh = new Set((khRows || []).map(r => r.ma_kh));
      const missingMap = {};

      (donRows || []).forEach(d => {
        const ma = d.ma_kh;
        if (ma && !existingKh.has(ma) && !missingMap[ma]) {
          missingMap[ma] = d;
        }
      });

      const missingKeys = Object.keys(missingMap);
      if (missingKeys.length === 0) {
        if (btn) { btn.innerText = oldText; btn.disabled = false; }
        this._showToast('Mọi khách hàng đã được đồng bộ đầy đủ.', 'success');
        return;
      }

      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const yyyy = today.getFullYear();
      const ngayTao = `${dd}/${mm}/${yyyy}`;

      const newRows = [];
      missingKeys.forEach(ma => {
        const d = missingMap[ma];
        newRows.push([
          ma, // ma_kh
          d.ten_khach || '',
          d.brand || '',
          d.nganh || '',
          d.fanpage || d.facebook || '', // facebook
          d.zalo || '',
          d.sdt || '',
          ngayTao, // ngay_tao
          '' // ghi_chu
        ]);
      });

      await this._appendSheet(CONFIG.SHEETS.KHACH_HANG, newRows);
      
      if (btn) { btn.innerText = oldText; btn.disabled = false; }
      this._showToast(`✅ Đồng bộ thành công ${newRows.length} khách hàng mới!`, 'success');
      this.renderKhachHangPage(); // reload the page
    } catch (e) {
      if (btn) { btn.innerText = oldText; btn.disabled = false; }
      console.error(e);
      this._showToast(`Lỗi đồng bộ: ${e.message}`, 'error');
    }
  },

  async renderKhachHangPage() {
    const content = document.getElementById('page-content');
    content.style.padding = '24px';
    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px 0;flex-direction:column;gap:16px;">
      <div class="spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(138,114,76,0.2);border-top-color:var(--clr-accent);"></div>
      <p style="font-size:var(--font-size-sm);color:var(--clr-text-muted);">Đang tải dữ liệu khách hàng...</p>
    </div>`;

    let khachHangList = [], donHangList = [], tienDonList = [];
    await Promise.allSettled([
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I')
        .then(r => { khachHangList = r || []; }),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG)
        .then(r => { donHangList = (r || []).filter(d => d.da_an !== 'yes'); }),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B')
        .then(r => { tienDonList = r || []; })
        .catch(e => console.warn('[KhachHang] TIEN_DON:', e.message)),
    ]);

    const tienDonMap = {};
    tienDonList.forEach(row => { if (row.ma_don) tienDonMap[row.ma_don] = row.tong_gia_tri; });
    donHangList.forEach(d => { if (tienDonMap[d.ma_don] !== undefined) d.tong_gia_tri = tienDonMap[d.ma_don]; });

    this._khachHangListFull = khachHangList;
    
    // Đếm số đơn của mỗi khách
    const donCountMap = {};
    const nganhCountMap = {};
    donHangList.forEach(d => {
      const tt = (d.trang_thai || '').toLowerCase();
      if (tt.includes('hủy') || tt.includes('huy')) return;

      const ma = d.ma_kh;
      if (ma) {
        donCountMap[ma] = (donCountMap[ma] || 0) + 1;
        if (!nganhCountMap[ma]) nganhCountMap[ma] = {};
        
        const nganh = (d.nganh || '').trim() || 'Khác';
        const giaTri = this._tinhSoPhaiThu(d);
        const currDoanhSo = nganhCountMap[ma][nganh]?.doanhSo || 0;
        const currCount = nganhCountMap[ma][nganh]?.soDon || 0;
        
        nganhCountMap[ma][nganh] = {
           soDon: currCount + 1,
           doanhSo: currDoanhSo + (isNaN(giaTri) ? 0 : giaTri)
        };
      }
    });

    this._khachHangDataView = khachHangList.map(k => ({
      ...k,
      so_don: donCountMap[k.ma_kh] || 0,
      chi_tiet_nganh: nganhCountMap[k.ma_kh] || {}
    })).sort((a, b) => b.so_don - a.so_don); // Sort by order count descending
    
    this._donHangDataKhach = donHangList; // to show in detail

    this._renderKhachHangTable();
  },

  _renderKhachHangTable(q = '') {
    const content = document.getElementById('page-content');
    q = q.toLowerCase();
    
    const filtered = this._khachHangDataView.filter(k => 
      (k.ma_kh || '').toLowerCase().includes(q) ||
      (k.ten_khach || '').toLowerCase().includes(q) ||
      (k.sdt || '').toLowerCase().includes(q) ||
      (k.zalo || '').toLowerCase().includes(q)
    );

    const rows = filtered.map(k => {
      const lienHe = [];
      if (k.sdt) lienHe.push(`SĐT: ${this._escHtml(k.sdt)}`);
      if (k.zalo) lienHe.push(`Zalo: ${this._escHtml(k.zalo)}`);
      if (k.fanpage || k.facebook) lienHe.push(`FB: ${this._escHtml(k.fanpage || k.facebook)}`);
      
      let orderHistoryHtml = '';
      if (k.so_don > 0 && k.chi_tiet_nganh) {
        const nganhEntries = Object.entries(k.chi_tiet_nganh);
        orderHistoryHtml = nganhEntries.map(([ng, data]) => {
           const moneyStr = data.doanhSo > 0 ? ` &middot; ${this._formatVND(data.doanhSo)}` : '';
           return `<span style="display:inline-block; padding:2px 8px; background:rgba(138,114,76,0.1); border-radius:12px; font-weight:600; font-size:12px; color:var(--clr-accent); margin:2px; white-space:nowrap;">${this._escHtml(ng)}: ${data.soDon} đơn${moneyStr}</span>`;
        }).join('');
      } else {
        orderHistoryHtml = `<span style="display:inline-block; padding:2px 8px; background:rgba(138,114,76,0.1); border-radius:12px; font-weight:600; font-size:12px; color:var(--clr-accent); margin:2px; white-space:nowrap;">0 đơn</span>`;
      }
      
      return `
        <tr class="table-row-hover" style="cursor:pointer;" onclick="App._openKhachHangDetail('${this._escHtml(k.ma_kh)}')">
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light); font-weight:600; color:var(--clr-accent);">${this._escHtml(k.ma_kh)}</td>
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light); font-weight:500;">${this._escHtml(k.ten_khach)}</td>
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light);">${this._escHtml(k.brand || '—')}</td>
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light);">${this._escHtml(k.nganh || '—')}</td>
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light); font-size:12px; color:var(--clr-text-muted);">${lienHe.join('<br>') || '—'}</td>
          <td style="padding:12px; border-bottom:1px solid var(--clr-border-light); text-align:center;">${orderHistoryHtml}</td>
        </tr>
      `;
    }).join('');

    const emptyState = `<tr><td colspan="6" style="padding:32px; text-align:center; color:var(--clr-text-muted);">Không tìm thấy khách hàng nào.</td></tr>`;
    
    const tbody = document.getElementById('khach-hang-tbody');
    const countEl = document.getElementById('khach-hang-count');

    if (tbody && countEl) {
      tbody.innerHTML = rows || emptyState;
      countEl.innerText = `Danh sách Khách Hàng (${filtered.length})`;
      return;
    }

    content.innerHTML = `
      <div style="max-width: 1200px; margin: 0 auto; background: var(--clr-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden;">
        <div style="padding: var(--space-5); border-bottom: 1px solid var(--clr-border); display: flex; justify-content: space-between; align-items: center;">
          <h2 id="khach-hang-count" style="margin: 0; font-size: 18px; font-weight: 600;">Danh sách Khách Hàng (${filtered.length})</h2>
          <div style="display:flex; gap:12px; align-items:center;">
            ${this.session?.role === 'admin' ? `<button class="btn btn-outline btn-sm" onclick="App._syncKhachHang(event)" title="Tự động quét các khách hàng trong mục Đơn hàng chưa có trong danh sách Khách hàng">Đồng bộ khách hàng</button>` : ''}
            <div style="position:relative; width: 300px;">
              <input type="text" class="form-input khach-hang-search-input" placeholder="Tìm tên, mã KH, SĐT, Zalo..." value="${this._escHtml(q)}" oninput="App._renderKhachHangTable(this.value)" style="padding-left:36px; border-radius:20px;">
              <svg style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--clr-text-muted);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </div>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
            <thead>
              <tr style="background: rgba(0,0,0,0.02); color: var(--clr-text-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">
                <th style="padding:12px; border-bottom:1px solid var(--clr-border);">Mã KH</th>
                <th style="padding:12px; border-bottom:1px solid var(--clr-border);">Tên khách hàng</th>
                <th style="padding:12px; border-bottom:1px solid var(--clr-border);">Brand</th>
                <th style="padding:12px; border-bottom:1px solid var(--clr-border);">Ngành</th>
                <th style="padding:12px; border-bottom:1px solid var(--clr-border);">Liên hệ</th>
                <th style="padding:12px; border-bottom:1px solid var(--clr-border); text-align:center;">Lịch sử đặt</th>
              </tr>
            </thead>
            <tbody id="khach-hang-tbody">
              ${rows || emptyState}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },
  
  _openKhachHangDetail(maKh) {
    const kh = this._khachHangListFull.find(k => k.ma_kh === maKh);
    if (!kh) return;

    // Lọc các đơn của khách
    const dons = this._donHangDataKhach.filter(d => d.ma_kh === maKh);
    let tongGiaoDich = 0;
    const donsHtml = dons.map(d => {
      const giaTri = App._tinhSoPhaiThu(d);
      let giaTriDisplay = '—';
      if (!isNaN(giaTri) && d.tong_gia_tri !== undefined && d.tong_gia_tri !== '') {
         tongGiaoDich += giaTri;
         giaTriDisplay = giaTri.toLocaleString('vi-VN') + ' ₫';
      }
      return `
      <div style="padding:12px; border:1px solid var(--clr-border-light); border-radius:8px; margin-bottom:8px; display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-weight:700; color:var(--clr-accent);">${this._escHtml(d.ma_don)}</div>
          <div style="font-size:12px; color:var(--clr-text-muted);">${this._escHtml(d.ngay_len_don || '')}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div style="font-size:13px; color:var(--clr-text-muted);">${this._escHtml(d.item || '')}</div>
          <div style="font-size:11px; font-weight:600; padding:2px 8px; border-radius:12px; background:${d.trang_thai === 'đang chạy' ? '#E8F5E9' : '#FDF0F4'}; color:${d.trang_thai === 'đang chạy' ? '#2E7D32' : '#C2185B'}; white-space:nowrap;">${this._escHtml(d.trang_thai || '')}</div>
        </div>
        <div style="font-weight:700; color:#9C7E5E; font-size:14px; white-space:nowrap; margin-top:2px;">${giaTriDisplay}</div>
      </div>
    `}).join('');

    const tongGiaoDichHtml = dons.length > 0 ? `
      <div style="margin-top:16px; padding-top:16px; border-top:2px dashed var(--clr-border-light); display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size:14px; font-weight:700; color:var(--clr-text);">TỔNG GIÁ TRỊ GIAO DỊCH:</span>
        <span style="font-size:18px; font-weight:800; color:#9C7E5E;">${tongGiaoDich.toLocaleString('vi-VN')} ₫</span>
      </div>
    ` : '';

    const overlay = document.createElement('div');
    overlay.id = 'kh-detail-overlay';
    overlay.className = 'kb-overlay';
    overlay.innerHTML = `
      <div class="kb-detail-modal" style="max-width: 800px;">
        <div class="kb-detail-header">
          <div>
            <div class="kb-detail-id">Hồ sơ khách hàng: ${this._escHtml(kh.ma_kh)}</div>
            <div class="kb-detail-khach">Cập nhật lúc: ${this._formatDateToday()}</div>
          </div>
          <button class="kb-detail-close" onclick="App._closeKhDetail()">✕</button>
        </div>

        <div class="kb-detail-body" style="grid-template-columns: 1fr 300px; padding-top: 16px;">
          <!-- Cột trái: Chỉnh sửa thông tin -->
          <div class="kb-detail-left">
            <h3 style="margin-top:0; margin-bottom:16px; font-size:16px; font-weight:600; border-bottom:1px solid var(--clr-border-light); padding-bottom:8px;">Thông tin cơ bản</h3>
            
            <div class="form-grid form-grid-2">
              <div class="form-group">
                <label class="form-label">Tên khách hàng</label>
                <input type="text" class="form-input" id="kh-det-ten" value="${this._escHtml(kh.ten_khach)}">
              </div>
              <div class="form-group">
                <label class="form-label">Brand</label>
                <input type="text" class="form-input" id="kh-det-brand" value="${this._escHtml(kh.brand)}">
              </div>
              <div class="form-group">
                <label class="form-label">Ngành</label>
                <input type="text" class="form-input" id="kh-det-nganh" value="${this._escHtml(kh.nganh)}">
              </div>
            </div>

            <h3 style="margin-top:24px; margin-bottom:16px; font-size:16px; font-weight:600; border-bottom:1px solid var(--clr-border-light); padding-bottom:8px;">Thông tin liên hệ</h3>
            <div class="form-grid form-grid-2">
              <div class="form-group">
                <label class="form-label">Facebook/Fanpage</label>
                <input type="text" class="form-input" id="kh-det-fanpage" value="${this._escHtml(kh.fanpage || kh.facebook || '')}">
              </div>
              <div class="form-group">
                <label class="form-label">Số Zalo</label>
                <input type="text" class="form-input" id="kh-det-zalo" value="${this._escHtml(kh.zalo)}">
              </div>
              <div class="form-group">
                <label class="form-label">Số điện thoại</label>
                <input type="text" class="form-input" id="kh-det-sdt" value="${this._escHtml(kh.sdt)}">
              </div>
            </div>
            
            <div class="form-group" style="margin-top: 16px;">
              <label class="form-label">Ghi chú</label>
              <textarea class="form-textarea" id="kh-det-ghichu" rows="3">${this._escHtml(kh.ghi_chu || '')}</textarea>
            </div>
          </div>

          <!-- Cột phải: Lịch sử đơn hàng -->
          <div class="kb-detail-right" style="border-left: 1px solid var(--clr-border-light); padding-left: 20px;">
            <div class="kb-detail-section-title">Lịch sử đơn hàng (${dons.length})</div>
            <div style="max-height: 400px; overflow-y: auto; padding-right: 4px;">
              ${donsHtml || '<div style="font-size:12px;color:var(--clr-text-muted);">Khách chưa có đơn hàng nào.</div>'}
              ${tongGiaoDichHtml}
            </div>
          </div>
        </div>

        <div class="kb-detail-footer">
          <button class="btn btn-ghost" onclick="App._closeKhDetail()">Đóng</button>
          <button class="btn btn-primary" id="btn-save-kh" onclick="App._saveKhDetail('${this._escHtml(kh.ma_kh)}')">
            Lưu thay đổi
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) this._closeKhDetail(); });
    requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));
  },

  _closeKhDetail() {
    const overlay = document.getElementById('kh-detail-overlay');
    if (!overlay) return;
    overlay.classList.remove('kb-overlay-visible');
    setTimeout(() => overlay.remove(), 250);
  },

  async _saveKhDetail(maKh) {
    const btn = document.getElementById('btn-save-kh');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang lưu...'; }

    try {
      const ten_khach = document.getElementById('kh-det-ten').value.trim();
      const brand = document.getElementById('kh-det-brand').value.trim();
      const nganh = document.getElementById('kh-det-nganh').value.trim();
      const fanpage = document.getElementById('kh-det-fanpage').value.trim();
      const zalo = document.getElementById('kh-det-zalo').value.trim();
      const sdt = document.getElementById('kh-det-sdt').value.trim();
      const ghi_chu = document.getElementById('kh-det-ghichu').value.trim();

      const rawKH = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I');
      const rowIndex = rawKH.findIndex(r => r.ma_kh === maKh);
      
      if (rowIndex >= 0) {
        const rowNum = rowIndex + 2; // +1 for header, +1 for 0-index
        const oldRow = rawKH[rowIndex];
        const updateData = [
          maKh, ten_khach, brand, nganh, fanpage, zalo, sdt, 
          oldRow.ngay_tao || this._formatDateToday(), 
          ghi_chu
        ];
        
        await this._writeSheet(CONFIG.SHEETS.KHACH_HANG, `A${rowNum}:I${rowNum}`, [updateData]);
        this._showToast('Đã lưu hồ sơ khách hàng!', 'success');
        
        // Update local cache
        const khIndex = this._khachHangListFull.findIndex(k => k.ma_kh === maKh);
        if (khIndex >= 0) {
          this._khachHangListFull[khIndex] = {
            ...this._khachHangListFull[khIndex],
            ten_khach, brand, nganh, fanpage, zalo, sdt, ghi_chu
          };
        }
        
        // Refresh view data array
        const viewIndex = this._khachHangDataView.findIndex(k => k.ma_kh === maKh);
        if (viewIndex >= 0) {
          this._khachHangDataView[viewIndex] = {
            ...this._khachHangDataView[viewIndex],
            ten_khach, brand, nganh, fanpage, zalo, sdt, ghi_chu
          };
        }
        
        // Refresh table if searching
        const searchInput = document.querySelector('.khach-hang-search-input');
        this._renderKhachHangTable(searchInput ? searchInput.value : '');
        this._closeKhDetail();
      } else {
        throw new Error("Không tìm thấy dòng khách hàng trong Google Sheets!");
      }
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi lưu khách hàng: ' + err.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Lưu thay đổi'; }
    }
  },

  _formatDateToday() {
    const n = new Date();
    return `${String(n.getDate()).padStart(2,'0')}/${String(n.getMonth()+1).padStart(2,'0')}/${n.getFullYear()}`;
  },

  _formatDateFromInput(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  },

  _formatNumber(num) {
    if (isNaN(num)) return '0';
    return Number(num).toLocaleString('vi-VN');
  },

  _formatVND(num) {
    if (isNaN(num)) return '0 đ';
    return this._formatNumber(Math.round(num)) + ' đ';
  },

  _parseCurrency(val) {
    if (val === undefined || val === null || val === '') return 0;
    // Bỏ tất cả dấu phẩy, dấu chấm, khoảng trắng
    // Ví dụ: 150.000 -> 150000, 1.500.000,00 -> 150000000
    // Wait, regex [^0-9-] removes dots and commas. So "149.850" becomes "149850"
    const cleaned = val.toString().replace(/[^0-9-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? 0 : parsed;
  },

  _tinhSoTienGiam(don) {
    if (!don) return 0;
    const tongGiaTri = this._parseCurrency(don.tong_gia_tri);
    if (tongGiaTri <= 0) return 0;
    
    const loaiGiam = (don.giam_gia_loai || '').trim();
    if (!loaiGiam) return 0;
    
    let giaTriGiam = 0;
    if (loaiGiam === 'amount') {
       giaTriGiam = this._parseCurrency(don.giam_gia_gia_tri);
    } else if (loaiGiam === 'percent') {
       // Allow decimal percentages
       const percentStr = (don.giam_gia_gia_tri || '').toString().replace(/,/g, '.');
       const percent = parseFloat(percentStr);
       if (!isNaN(percent) && percent > 0 && percent <= 100) {
          giaTriGiam = Math.round(tongGiaTri * (percent / 100));
       }
    }
    
    if (giaTriGiam < 0) return 0;
    if (giaTriGiam > tongGiaTri) return tongGiaTri; // Max discount is 100%
    return giaTriGiam;
  },

  _tinhSoPhaiThu(don) {
    if (!don) return 0;
    const tongGiaTri = this._parseCurrency(don.tong_gia_tri);
    if (tongGiaTri <= 0) return 0;
    
    const giamGia = this._tinhSoTienGiam(don);
    const phaiThu = tongGiaTri - giamGia;
    return phaiThu < 0 ? 0 : phaiThu;
  },

  /**
   * Helper: Convert Google Sheets serial date (e.g. 46235) to MM/YYYY string.
   * If not a number, returns the trimmed string (strips leading single quote if present).
   */
  _serialToMonthYear(serial) {
    if (!serial) return '';
    const raw = serial.toString().trim();
    const cleanRaw = raw.startsWith("'") ? raw.substring(1) : raw;
    const num = parseFloat(cleanRaw);
    if (!isNaN(num) && num > 10000) {
      // Excel/Google Sheets epoch is Dec 30, 1899
      const excelEpoch = new Date(1899, 11, 30);
      const jsDate = new Date(excelEpoch.getTime() + num * 86400000);
      const mm = String(jsDate.getMonth() + 1).padStart(2, '0');
      const yyyy = jsDate.getFullYear();
      return `${mm}/${yyyy}`;
    }
    return cleanRaw;
  },

  // ════════════════════════════════════════════════════════════
  //  MÀN HÌNH DOANH THU PIXEL
  // ════════════════════════════════════════════════════════════

  async renderDoanhThuPage() {
    const content = document.getElementById('page-content');
    content.style.padding = '12px';
    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px 0;flex-direction:column;gap:16px;">
      <div class="spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(138,114,76,0.2);border-top-color:var(--clr-accent);"></div>
      <p style="font-size:var(--font-size-sm);color:var(--clr-text-muted);">Đang tải dữ liệu doanh thu...</p>
    </div>`;

    try {
      const [gdData, donData, danhMucNganh, danhMucItem, tienDonData] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.GIAO_DICH_TIEN, 'A:E'),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DANH_MUC_NGANH),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DANH_MUC_ITEM),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => [])
      ]);

      this._doanhThuData = gdData || [];
      const donHangList = (donData || []).filter(d => d.da_an !== 'yes');
      this._doanhThuDonHangList = donHangList;
      const tienDonList = tienDonData || [];
      
      const tienDonMap = {};
      tienDonList.forEach(row => { if (row.ma_don) tienDonMap[row.ma_don] = row.tong_gia_tri; });
      donHangList.forEach(d => { if (tienDonMap[d.ma_don] !== undefined) d.tong_gia_tri = tienDonMap[d.ma_don]; });
      
      const donMap = {};
      donHangList.forEach(d => {
        if (d.ma_don) {
          donMap[d.ma_don] = {
            nganh: d.nganh || '',
            sale_phu_trach: d.sale_phu_trach || '',
            ma_kh: d.ma_kh || '',
            item: d.item || ''
          };
        }
      });

      const uniqueSale = new Set();
      const uniqueKh = new Set();
      const uniqueLoai = new Set();

      this._doanhThuData = this._doanhThuData.filter(r => {
        const donInfo = donMap[r.ma_don];
        if (!donInfo) return false; // Bỏ qua giao dịch của đơn đã ẩn hoặc không tồn tại

        if (r.ngay) {
          const [d, m, y] = r.ngay.split('/');
          r.parsedDate = new Date(y, m - 1, d);
        } else {
          r.parsedDate = new Date(0);
        }
        r.so_tien = this._parseCurrency(r.so_tien);

        r.nganh = donInfo.nganh;
        r.sale_phu_trach = donInfo.sale_phu_trach;
        r.ma_kh = donInfo.ma_kh;
        r.item = donInfo.item;

        if (r.sale_phu_trach) uniqueSale.add(r.sale_phu_trach);
        if (r.ma_kh) uniqueKh.add(r.ma_kh);
        if (r.loai) uniqueLoai.add(r.loai);
        
        return true;
      });

      this._doanhThuFilters = {
        nganh: (danhMucNganh || []).map(r => r.ten_nganh).filter(Boolean),
        sale: Array.from(uniqueSale).sort(),
        kh: Array.from(uniqueKh).sort(),
        item: (danhMucItem || []).map(r => r.ten_item).filter(Boolean),
        loai: Array.from(uniqueLoai).sort()
      };

      this._renderDoanhThuContent('month'); // default to this month
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div style="color:var(--clr-error); padding:24px;">Lỗi tải dữ liệu: ${this._escHtml(e.message)}</div>`;
    }
  },

  _renderDoanhThuContent(filterType = 'month', customFrom = '', customTo = '', fNganh = 'all', fSale = 'all', fKh = 'all', fItem = 'all', fLoai = 'all') {
    const content = document.getElementById('page-content');
    const today = new Date();
    let startDate, endDate;

    if (filterType === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    } else if (filterType === 'last_month') {
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      endDate = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59);
    } else if (filterType === 'quarter') {
      const q = Math.floor(today.getMonth() / 3);
      startDate = new Date(today.getFullYear(), q * 3, 1);
      endDate = new Date(today.getFullYear(), q * 3 + 3, 0, 23, 59, 59);
    } else if (filterType === 'year') {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    } else if (filterType === 'custom') {
      startDate = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(0);
      endDate = customTo ? new Date(customTo + 'T23:59:59') : new Date('2999-12-31');
    }

    let tongDoanhThu = 0;
    let tongThu = 0;
    let tongHoan = 0;
    let tongTip = 0;
    let soGiaoDich = 0;
    
    let trendMap = {}; // Lưu dữ liệu biểu đồ xu hướng theo ngày lên đơn

    let tongThuDonKy = 0;
    let tongThuNoCu = 0;
    let congNo = 0;
    let soDon = 0;

    const dailyMap = {};
    this._doanhThuCurrentFilteredData = [];

    const parseDateStr = (dateStr) => {
      if (!dateStr) return null;
      const parts = dateStr.trim().split('/');
      if (parts.length < 2) return null;
      let d = 1, m, y;
      if (parts.length === 2) { 
         d = 1; m = parseInt(parts[0], 10); y = parseInt(parts[1], 10);
      } else {
         d = parseInt(parts[0], 10); m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
      }
      if (isNaN(y) || y < 1970) y = today.getFullYear();
      if (isNaN(m) || m < 1 || m > 12) return null;
      return new Date(y, m - 1, d);
    };

    this._doanhThuData.forEach(r => {
      if (r.parsedDate < startDate || r.parsedDate > endDate) return;

      if (fNganh !== 'all' && r.nganh !== fNganh) return;
      if (fSale !== 'all' && r.sale_phu_trach !== fSale) return;
      if (fKh !== 'all' && r.ma_kh !== fKh) return;
      if (fItem !== 'all' && r.item !== fItem) return;
      if (fLoai !== 'all' && r.loai !== fLoai) return;

      const tien = r.so_tien;
      const isTip = r.loai && r.loai.toLowerCase() === 'tip';

      if (tien < 0) tongHoan += Math.abs(tien);
      if (isTip) tongTip += tien;

      if (tien > 0 && !isTip) {
         const donHang = (this._doanhThuDonHangList || []).find(d => d.ma_don === r.ma_don);
         if (donHang) {
            const ngayLenDonDate = parseDateStr(donHang.ngay_len_don || donHang.ngay_tao || '');
            if (ngayLenDonDate && ngayLenDonDate < startDate) {
               tongThuNoCu += tien;
            }
         }
      }

      const dateStr = r.ngay || 'Chưa rõ';
      if (!dailyMap[dateStr]) {
        dailyMap[dateStr] = { date: dateStr, parsedDate: r.parsedDate, total: 0, count: 0 };
      }
      dailyMap[dateStr].total += tien;
      dailyMap[dateStr].count += 1;
      this._doanhThuCurrentFilteredData.push(r);
    });

    this._zeroValueOrdersFiltered = [];
    (this._doanhThuDonHangList || []).forEach(don => {
       if (fNganh !== 'all' && (don.nganh || '') !== fNganh) return;
       if (fSale !== 'all' && (don.sale_phu_trach || '') !== fSale) return;
       if (fKh !== 'all' && (don.ma_kh || '') !== fKh) return;
       if (fItem !== 'all' && (don.item || '') !== fItem) return;

       const ngayLenDonDate = parseDateStr(don.ngay_len_don || don.ngay_tao || '');
       if (!ngayLenDonDate) return;

       if (ngayLenDonDate >= startDate && ngayLenDonDate <= endDate) {
          soDon++;
          const soPhaiThu = this._tinhSoPhaiThu(don);
          tongDoanhThu += soPhaiThu;

          let daThucThuThatSu = 0;
          let daThucThuFilter = 0;
          const gdCuaDon = this._doanhThuData.filter(r => r.ma_don === don.ma_don);
          gdCuaDon.forEach(r => {
             const isTip = r.loai && r.loai.toLowerCase() === 'tip';
             if (r.so_tien > 0 && !isTip) {
                daThucThuThatSu += r.so_tien;
                if (fLoai === 'all' || r.loai === fLoai) {
                   daThucThuFilter += r.so_tien;
                }
             }
          });
          
          tongThuDonKy += daThucThuFilter;

          let no = soPhaiThu - daThucThuThatSu;
          if (no > 0) congNo += no;

          if (don.da_an !== 'yes' && this._parseCurrency(don.tong_gia_tri) <= 0) {
             if (!this._zeroValueOrdersFiltered) this._zeroValueOrdersFiltered = [];
             this._zeroValueOrdersFiltered.push(don);
          }
          
          if (don.da_an !== 'yes') {
             const d = ngayLenDonDate.getDate();
             const m = ngayLenDonDate.getMonth() + 1;
             const y = ngayLenDonDate.getFullYear();
             const dateStr = `${d < 10 ? '0'+d : d}/${m < 10 ? '0'+m : m}/${y}`;
             if (!trendMap[dateStr]) {
                trendMap[dateStr] = { date: dateStr, parsedDate: ngayLenDonDate, total: 0 };
             }
             trendMap[dateStr].total += soPhaiThu;
          }
       }
    });

    tongThu = tongThuDonKy + tongThuNoCu;
    soGiaoDich = soDon;

    // Sắp xếp ngày từ mới nhất đến cũ nhất (mới nhất ở trên)
    const dailyArr = Object.values(dailyMap).sort((a, b) => b.parsedDate - a.parsedDate);
    
    // Lưu tạm cho tính năng xuất Excel
    this._doanhThuCurrentExport = dailyArr;

    const btnStyle = "padding:6px 12px; border-radius:16px; border:1px solid var(--clr-border-light); background:var(--clr-surface); cursor:pointer; font-size:13px; font-weight:500; color:var(--clr-text); transition:all 0.2s;";
    const btnActiveStyle = "padding:6px 12px; border-radius:16px; border:1px solid var(--clr-accent); background:var(--clr-accent); color:#fff; cursor:pointer; font-size:13px; font-weight:500; transition:all 0.2s;";
    const selectStyle = "padding:6px 10px; border-radius:8px; border:1px solid var(--clr-border-light); font-size:13px; background:var(--clr-surface); max-width:150px;";

    const buildOptions = (arr, currentVal) => {
      let html = `<option value="all">Tất cả</option>`;
      arr.forEach(item => {
        const selected = item === currentVal ? 'selected' : '';
        html += `<option value="${this._escHtml(item)}" ${selected}>${this._escHtml(item)}</option>`;
      });
      return html;
    };

    const filterOnChange = `App._renderDoanhThuContent('${filterType}', '${customFrom}', '${customTo}', document.getElementById('dt-nganh').value, document.getElementById('dt-sale').value, document.getElementById('dt-kh').value, document.getElementById('dt-item').value, document.getElementById('dt-loai').value)`;
    const resetFilterClick = `App._renderDoanhThuContent('month', '', '', 'all', 'all', 'all', 'all', 'all')`;

    content.innerHTML = `
      <div id="dt-content-wrap" style="max-width: 1200px; margin: 0 auto; display:flex; flex-direction:column; gap:24px;">
        
        <!-- BỘ LỌC -->
        <div style="background:var(--clr-card); padding:20px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); display:flex; flex-direction:column; gap:16px;">
          
          <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center; justify-content:space-between;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button style="${filterType === 'month' ? btnActiveStyle : btnStyle}" onclick="App._renderDoanhThuContent('month', '', '', '${this._escHtml(fNganh)}', '${this._escHtml(fSale)}', '${this._escHtml(fKh)}', '${this._escHtml(fItem)}', '${this._escHtml(fLoai)}')">Tháng này</button>
              <button style="${filterType === 'last_month' ? btnActiveStyle : btnStyle}" onclick="App._renderDoanhThuContent('last_month', '', '', '${this._escHtml(fNganh)}', '${this._escHtml(fSale)}', '${this._escHtml(fKh)}', '${this._escHtml(fItem)}', '${this._escHtml(fLoai)}')">Tháng trước</button>
              <button style="${filterType === 'quarter' ? btnActiveStyle : btnStyle}" onclick="App._renderDoanhThuContent('quarter', '', '', '${this._escHtml(fNganh)}', '${this._escHtml(fSale)}', '${this._escHtml(fKh)}', '${this._escHtml(fItem)}', '${this._escHtml(fLoai)}')">Quý này</button>
              <button style="${filterType === 'year' ? btnActiveStyle : btnStyle}" onclick="App._renderDoanhThuContent('year', '', '', '${this._escHtml(fNganh)}', '${this._escHtml(fSale)}', '${this._escHtml(fKh)}', '${this._escHtml(fItem)}', '${this._escHtml(fLoai)}')">Năm nay</button>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:flex-end;">
              <span style="font-size:14px; font-weight:500; width:100%;">Hoặc chọn ngày:</span>
              <div style="display:flex; gap:8px; align-items:flex-end; flex:1 1 auto;">
                <div style="display:flex; flex-direction:column; gap:4px; flex:1 1 0;">
                  <label for="dt-from" style="font-size:12px; font-style:italic; color:var(--clr-text-muted);">Từ ngày</label>
                  <input type="date" id="dt-from" class="form-input" style="width:100%; padding:6px 10px;" value="${customFrom}">
                </div>
                <span style="color:var(--clr-text-muted); align-self:center; padding-bottom:6px;">-</span>
                <div style="display:flex; flex-direction:column; gap:4px; flex:1 1 0;">
                  <label for="dt-to" style="font-size:12px; font-style:italic; color:var(--clr-text-muted);">Đến ngày</label>
                  <input type="date" id="dt-to" class="form-input" style="width:100%; padding:6px 10px;" value="${customTo}">
                </div>
              </div>
              <button class="btn btn-outline btn-sm" onclick="App._renderDoanhThuContent('custom', document.getElementById('dt-from').value, document.getElementById('dt-to').value, '${this._escHtml(fNganh)}', '${this._escHtml(fSale)}', '${this._escHtml(fKh)}', '${this._escHtml(fItem)}', '${this._escHtml(fLoai)}')">Lọc</button>
            </div>
          </div>

          <div style="border-top:1px dashed var(--clr-border-light); margin:4px 0;"></div>

          <!-- BỘ LỌC KẾT HỢP -->
          <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:center;">
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:13px; font-weight:500;">Ngành:</label>
              <select id="dt-nganh" style="${selectStyle}" onchange="${filterOnChange}">
                ${buildOptions(this._doanhThuFilters.nganh, fNganh)}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:13px; font-weight:500;">Sale:</label>
              <select id="dt-sale" style="${selectStyle}" onchange="${filterOnChange}">
                ${buildOptions(this._doanhThuFilters.sale, fSale)}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:13px; font-weight:500;">Mã KH:</label>
              <select id="dt-kh" style="${selectStyle}" onchange="${filterOnChange}">
                ${buildOptions(this._doanhThuFilters.kh, fKh)}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:13px; font-weight:500;">Item:</label>
              <select id="dt-item" style="${selectStyle}" onchange="${filterOnChange}">
                ${buildOptions(this._doanhThuFilters.item, fItem)}
              </select>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
              <label style="font-size:13px; font-weight:500;">Loại giao dịch:</label>
              <select id="dt-loai" style="${selectStyle}" onchange="${filterOnChange}">
                ${buildOptions(this._doanhThuFilters.loai, fLoai)}
              </select>
            </div>
            <div style="flex-grow:1; text-align:right;">
              <button class="btn btn-ghost btn-sm" onclick="${resetFilterClick}" style="color:var(--clr-error);">Xóa bộ lọc</button>
            </div>
          </div>
        </div>

        <!-- CHỈ SỐ TỔNG -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:16px;">
          <div style="background:linear-gradient(135deg, #EDE7F6, #F3EFFB); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm);">
            <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">Tổng doanh thu</div>
            <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatVND(tongDoanhThu)}</div>
          </div>
          <div style="background:linear-gradient(135deg, #FCE4EC, #FDF0F4); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm);">
            <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">Tổng thu</div>
            <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatVND(tongThu)}</div>
            <div style="font-size:11px; color:var(--clr-text-muted); margin-top:8px; font-weight:500;">Đơn tháng này: ${this._formatVND(tongThuDonKy)} &middot; Thu nợ cũ: ${this._formatVND(tongThuNoCu)}</div>
          </div>
          <div onclick="App._showChiTietHoan()" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)'" style="background:linear-gradient(135deg, #FFF0E5, #FFF6EF); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm); cursor:pointer; transition:all 0.2s;" title="Bấm xem chi tiết">
            <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
               Tổng hoàn <span style="display:flex; align-items:center; opacity:0.6;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>
            </div>
            <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatVND(tongHoan)}</div>
          </div>
          <div style="background:linear-gradient(135deg, #FFEBEE, #FDE0E4); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm);">
            <div style="font-size:13px; color:#C62828; text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">Công nợ</div>
            <div style="font-size:28px; font-weight:800; color:#B71C1C;">${this._formatVND(congNo)}</div>
          </div>
          <div style="background:linear-gradient(135deg, #EDE7F6, #F3EFFB); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm);">
            <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">Số đơn</div>
            <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatNumber(soDon)}</div>
          </div>
        </div>

        ${this.session?.role === 'admin' ? (this._zeroValueOrdersFiltered.length > 0 ? `
        <!-- CẢNH BÁO ĐƠN 0Đ (CÓ LỖI) -->
        <div onclick="App._showDonKhongDong()" style="background:linear-gradient(135deg, #FFEBEE, #FFCDD2); padding:16px 20px; border-radius:16px; border:1px solid #EF9A9A; box-shadow:var(--shadow-sm); cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s; margin-bottom:16px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)'" title="Bấm để xem danh sách">
           <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:24px;">⚠️</span>
              <div>
                 <div style="font-size:16px; font-weight:700; color:#B71C1C;">Cảnh báo: Phát hiện ${this._zeroValueOrdersFiltered.length} đơn có giá trị 0đ</div>
                 <div style="font-size:13px; color:#C62828; margin-top:2px;">Bấm vào đây để rà soát danh sách, đề phòng sale giấu doanh thu.</div>
              </div>
           </div>
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#B71C1C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
        ` : `
        <!-- CẢNH BÁO ĐƠN 0Đ (AN TOÀN) -->
        <div onclick="App._showDonKhongDong()" style="background:linear-gradient(135deg, #E8F5E9, #C8E6C9); padding:16px 20px; border-radius:16px; border:1px solid #A5D6A7; box-shadow:var(--shadow-sm); cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:all 0.2s; margin-bottom:16px;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='var(--shadow-md)'" onmouseout="this.style.transform='none'; this.style.boxShadow='var(--shadow-sm)'" title="An toàn">
           <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:24px; color:#2E7D32;">✓</span>
              <div>
                 <div style="font-size:16px; font-weight:700; color:#2E7D32;">Không phát hiện đơn giá trị 0đ nào</div>
                 <div style="font-size:13px; color:#388E3C; margin-top:2px;">Kỳ này không có dấu hiệu sale giấu doanh thu. (Có thể bấm để xem danh sách trống)</div>
              </div>
           </div>
           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </div>
        `) : ''}

        <!-- BIỂU ĐỒ -->
        <div id="dt-charts-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(0, 1fr)); gap:16px; margin-bottom:16px;">
          <!-- Biểu đồ đường (Trend) -->
          <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); padding:20px; display:flex; flex-direction:column;">
            <h3 style="margin:0 0 16px 0; font-size:16px; font-weight:600;">Xu hướng Doanh số theo ngày</h3>
            <div style="flex-grow:1; min-height:300px; position:relative; display:flex; justify-content:center; align-items:center;">
              <canvas id="chart-trend"></canvas>
              <div id="chart-trend-empty" style="display:none; color:var(--clr-text-muted); font-size:14px; position:absolute;">Không có dữ liệu để vẽ biểu đồ</div>
            </div>
          </div>
          <!-- Biểu đồ tỷ trọng -->
          <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); padding:20px; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
              <h3 style="margin:0; font-size:16px; font-weight:600;">Cơ cấu Doanh thu</h3>
              <select id="chart-pie-dimension" class="form-select" style="width:auto; padding:4px 24px 4px 8px; font-size:13px;" onchange="App._drawDoanhThuPieChart(this.value)">
                <option value="nganh">Theo Ngành</option>
                <option value="sale_phu_trach">Theo Sale</option>
                <option value="item">Theo Item</option>
              </select>
            </div>
            <div style="flex-grow:1; min-height:300px; position:relative; display:flex; justify-content:center; align-items:center;">
              <canvas id="chart-pie"></canvas>
              <div id="chart-pie-empty" style="display:none; color:var(--clr-text-muted); font-size:14px; position:absolute;">Không có dữ liệu để vẽ biểu đồ</div>
            </div>
          </div>
        </div>

        <!-- BẢNG THEO NGÀY -->
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light); display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Doanh thu theo ngày</h3>
            <button class="btn btn-outline btn-sm" onclick="App._exportDoanhThuCsv()">
              <svg viewBox="0 0 24 24" width="16" height="16" style="margin-right:6px;" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Xuất Excel
            </button>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Ngày</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:center;">Số giao dịch</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Tổng thu trong ngày</th>
                </tr>
              </thead>
              <tbody>
                ${dailyArr.length > 0 ? dailyArr.map(r => `
                  <tr class="table-row-hover">
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); font-weight:500;">${r.date}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:center;">${r.count}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600; color:${r.total >= 0 ? 'var(--clr-accent)' : '#E74C3C'}">${this._formatVND(r.total)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="3" style="padding:32px; text-align:center; color:var(--clr-text-muted);">Không có doanh thu trong kỳ này</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    `;

    const trendArr = Object.values(trendMap).sort((a, b) => b.parsedDate - a.parsedDate);
    setTimeout(() => this._initDoanhThuCharts(trendArr), 100);
  },

  _initDoanhThuCharts(dailyArr) {
    if (!window.Chart) return;
    this._doanhThuCharts = this._doanhThuCharts || {};

    // 1. Vẽ biểu đồ Đường
    if (this._doanhThuCharts.trend) {
      this._doanhThuCharts.trend.destroy();
    }
    
    const canvasTrend = document.getElementById('chart-trend');
    const emptyTrend = document.getElementById('chart-trend-empty');
    if (canvasTrend && emptyTrend) {
      if (!dailyArr || dailyArr.length === 0) {
        canvasTrend.style.display = 'none';
        emptyTrend.style.display = 'block';
      } else {
        canvasTrend.style.display = 'block';
        emptyTrend.style.display = 'none';

        const chartData = [...dailyArr].reverse();
        const labels = chartData.map(r => r.date.substring(0, 5)); 

        const ctx = canvasTrend.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, canvasTrend.parentElement.offsetHeight || 300);
        gradient.addColorStop(0, 'rgba(183, 168, 143, 0.5)'); // #B7A88F
        gradient.addColorStop(1, 'rgba(183, 168, 143, 0.0)');

        this._doanhThuCharts.trend = new Chart(canvasTrend, {
          type: 'line',
          data: {
            labels: labels,
            datasets: [{
              label: 'Doanh số (VNĐ)',
              data: chartData.map(r => r.total),
              borderColor: '#B7A88F',
              backgroundColor: gradient,
              borderWidth: 2,
              tension: 0.4,
              fill: true,
              pointBackgroundColor: '#B7A88F',
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { 
              legend: { display: false },
              tooltip: {
                callbacks: {
                  title: function() { return ''; },
                  label: function(context) {
                    let value = context.raw || 0;
                    return 'Doanh số ngày ' + (context.label || '') + ': ' + Number(value).toLocaleString('vi-VN') + ' đ';
                  }
                }
              }
            },
            scales: { y: { beginAtZero: true } }
          }
        });
      }
    }

    // 2. Vẽ biểu đồ Tròn
    const dimSelect = document.getElementById('chart-pie-dimension');
    if (dimSelect) {
      this._drawDoanhThuPieChart(dimSelect.value);
    }
  },

  _drawDoanhThuPieChart(dimension) {
    if (!window.Chart) return;
    this._doanhThuCharts = this._doanhThuCharts || {};
    
    if (this._doanhThuCharts.pie) {
      this._doanhThuCharts.pie.destroy();
    }

    const canvasPie = document.getElementById('chart-pie');
    const emptyPie = document.getElementById('chart-pie-empty');
    if (!canvasPie || !emptyPie) return;

    if (!this._doanhThuCurrentFilteredData || this._doanhThuCurrentFilteredData.length === 0) {
      canvasPie.style.display = 'none';
      emptyPie.style.display = 'block';
      return;
    }

    const mapGroup = {};
    this._doanhThuCurrentFilteredData.forEach(r => {
      let key = r[dimension];
      if (typeof key === 'string') key = key.trim();
      if (!key) key = 'Không xác định';
      if (!mapGroup[key]) mapGroup[key] = 0;
      mapGroup[key] += r.so_tien;
    });

    const keys = [];
    const values = [];
    Object.entries(mapGroup)
      .sort((a, b) => b[1] - a[1]) // Giảm dần
      .forEach(([k, v]) => {
        if (v > 0) {
          keys.push(k);
          values.push(v);
        }
      });

    if (values.length === 0) {
      canvasPie.style.display = 'none';
      emptyPie.style.display = 'block';
      return;
    }

    canvasPie.style.display = 'block';
    emptyPie.style.display = 'none';

    this._doanhThuCharts.pie = new Chart(canvasPie, {
      type: 'bar',
      data: {
        labels: keys,
        datasets: [{
          data: values,
          backgroundColor: '#B7A88F',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const val = context.raw || 0;
                return label + ': ' + App._formatVND(val);
              }
            }
          }
        }
      }
    });
  },

  _exportDoanhThuCsv() {
    if (!this._doanhThuCurrentExport || this._doanhThuCurrentExport.length === 0) {
      this._showToast('Không có dữ liệu để xuất.', 'error');
      return;
    }
    const headers = ['Ngày', 'Số giao dịch', 'Tổng thu trong ngày'];
    const rows = this._doanhThuCurrentExport.map(r => [
      r.date, 
      r.count, 
      r.total
    ]);
    
    // Add BOM for Excel UTF-8
    let csvContent = '\\uFEFF' + headers.join(',') + '\\n';
    rows.forEach(r => {
      csvContent += r.join(',') + '\\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Doanh_Thu_Pixel_${this._formatDateToday().replace(/\\//g,'-')}.csv`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ════════════════════════════════════════════════════════════
  //  HIEU SUAT DESIGNER PAGE
  // ════════════════════════════════════════════════════════════

  async renderHieuSuatPage() {
    const role = this.session?.role;
    const content = document.getElementById('page-content');
    
    if (role === 'sale') {
      content.innerHTML = '<div style="padding:40px; text-align:center; color:var(--clr-error);">Bạn không có quyền truy cập trang này.</div>';
      return;
    }

    content.innerHTML = '<div class="kb-loading"><div class="spinner"></div> Đang tải dữ liệu báo cáo...</div>';

    try {
      // 1. Đọc dữ liệu 1 lần
      const [xuLyRows, luongRows, donHangData] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY).catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER).catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG).catch(() => [])
      ]);
      
      const validDonMap = {};
      (donHangData || []).filter(d => d.da_an !== 'yes').forEach(d => {
        if (d.ma_don) validDonMap[d.ma_don] = true;
      });

      this._hieuSuatXuLyRows = (xuLyRows || []).filter(r => validDonMap[r.ma_don]);
      this._hieuSuatLuongRows = (luongRows || []).filter(r => validDonMap[r.ma_don]);

      // Render nội dung ban đầu (mặc định: Điểm xử lý, Tháng này)
      this._renderHieuSuatContent('xu_ly', 'month', '', '');
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div style="padding:24px; color:red; text-align:center;">Lỗi tải dữ liệu: ${e.message}</div>`;
    }
  },

  _renderHieuSuatContent(loaiDiem = 'xu_ly', filterType = 'month', customFrom = '', customTo = '') {
    const content = document.getElementById('page-content');
    const today = new Date();
    let startDate = new Date(0);
    let endDate = new Date('2999-12-31');

    if (filterType === 'week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Đầu tuần là Thứ 2
      startDate = new Date(today.getFullYear(), today.getMonth(), diff, 0, 0, 0);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6, 23, 59, 59);
    } else if (filterType === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
    } else if (filterType === 'custom') {
      startDate = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(0);
      endDate = customTo ? new Date(customTo + 'T23:59:59') : new Date('2999-12-31');
    }

    const xuLyRows = [];
    const luongRows = [];

    // Parse ngày dạng 'YYYY-MM-DD' từ Google Sheet
    const parseDate = (dStr) => {
      if (!dStr) return null;
      const clean = dStr.replace(/'/g, '').trim();
      const parts = clean.split('-');
      if (parts.length === 3) {
         return new Date(parts[0], parts[1] - 1, parts[2]);
      }
      return null;
    };

    const isDesigner = this.session?.role === CONFIG.ROLES.DESIGNER;
    const sessionTen = (this.session?.ten || '').trim().toLowerCase();

    // 1. Lọc theo khoảng thời gian, loại điểm, và role
    if (loaiDiem === 'xu_ly' && this._hieuSuatXuLyRows) {
      this._hieuSuatXuLyRows.forEach(r => {
        const pd = parseDate(r.ngay_ghi_nhan);
        if (!pd) return; // Bỏ qua nếu ngày trống
        if (pd >= startDate && pd <= endDate) {
          if (isDesigner) {
            const t = (r.ten_designer || r.designer || r.ho_ten || r.ten || '').trim().toLowerCase();
            if (t !== sessionTen) return;
          }
          xuLyRows.push(r);
        }
      });
    }

    if (loaiDiem === 'luong' && this._hieuSuatLuongRows) {
      this._hieuSuatLuongRows.forEach(r => {
        const pd = parseDate(r.ngay_ghi_nhan);
        if (!pd) return; // Bỏ qua nếu ngày trống
        if (pd >= startDate && pd <= endDate) {
          if (isDesigner) {
            const t = (r.ten_designer || r.designer || r.ho_ten || r.ten || '').trim().toLowerCase();
            if (t !== sessionTen) return;
          }
          luongRows.push(r);
        }
      });
    }

    // 2. Gom nhóm theo designer
    const designerMap = {};
    const addDesignerIfMissing = (name) => {
      if (!name) return;
      if (!designerMap[name]) {
        designerMap[name] = { ten: name, soDonXuLy: new Set(), tongDiemXuLy: 0, soDonLuong: new Set(), tongDiemLuong: 0 };
      }
    };

    xuLyRows.forEach(r => {
      const t = (r.ten_designer || r.designer || r.ho_ten || r.ten || '').trim();
      if (!t) return;
      
      addDesignerIfMissing(t);
      const score = parseFloat((r.diem_tam || '').toString().replace(/,/g, '.'));
      if (!isNaN(score) && score > 0) {
         designerMap[t].tongDiemXuLy += score;
         if (r.ma_don) designerMap[t].soDonXuLy.add(r.ma_don);
      }
    });

    luongRows.forEach(r => {
      const t = (r.ten_designer || r.designer || r.ho_ten || r.ten || '').trim();
      if (!t) return;
      
      addDesignerIfMissing(t);
      const score = parseFloat((r.diem || '').toString().replace(/,/g, '.'));
      if (!isNaN(score) && score > 0) {
         designerMap[t].tongDiemLuong += score;
         if (r.ma_don) designerMap[t].soDonLuong.add(r.ma_don);
      }
    });

    const designerList = Object.values(designerMap);
    if (loaiDiem === 'xu_ly') {
       designerList.sort((a, b) => b.tongDiemXuLy - a.tongDiemXuLy);
    } else {
       designerList.sort((a, b) => b.tongDiemLuong - a.tongDiemLuong);
    }

    // Styles
    const btnStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-border-light); background:var(--clr-surface); cursor:pointer; font-size:14px; font-weight:500; color:var(--clr-text); transition:all 0.2s;";
    const btnActiveStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-accent); background:var(--clr-accent); color:#fff; cursor:pointer; font-size:14px; font-weight:500; transition:all 0.2s;";
    const inputStyle = "padding:8px 12px; border-radius:8px; border:1px solid var(--clr-border-light); font-size:14px; background:var(--clr-surface); outline:none;";

    const filterOnChange = `App._renderHieuSuatContent('${loaiDiem}', 'custom', document.getElementById('hs-from').value, document.getElementById('hs-to').value)`;

    // HTML Render UI
    let html = `
      <div style="max-width: 1200px; margin: 0 auto; display:flex; flex-direction:column; gap:24px;">
        
        <!-- BỘ LỌC -->
        <div style="background:var(--clr-card); padding:20px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); display:flex; flex-direction:column; gap:20px;">
          
          <!-- Tab Chọn loại điểm -->
          <div style="display:flex; gap:12px; border-bottom:1px solid var(--clr-border-light); padding-bottom:16px;">
            <button style="${loaiDiem === 'xu_ly' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatContent('xu_ly', '${filterType}', '${customFrom}', '${customTo}')">Điểm xử lý</button>
            <button style="${loaiDiem === 'luong' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatContent('luong', '${filterType}', '${customFrom}', '${customTo}')">Điểm lương</button>
          </div>

          <!-- Lọc thời gian -->
          <div style="display:flex; flex-wrap:wrap; gap:16px; align-items:center;">
            <div style="display:flex; gap:8px;">
              <button style="${filterType === 'week' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatContent('${loaiDiem}', 'week', '', '')">Tuần này</button>
              <button style="${filterType === 'month' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatContent('${loaiDiem}', 'month', '', '')">Tháng này</button>
            </div>
            
            <div style="width:1px; height:24px; background:var(--clr-border-light); margin:0 8px;"></div>
            
            <div id="hs-dsg-date" style="display:flex; gap:12px; align-items:center;">
              <span style="font-size:14px; font-weight:500;">Từ ngày:</span>
              <input type="date" id="hs-from" value="${customFrom}" style="${inputStyle}" onchange="${filterOnChange}">
              <span style="font-size:14px; font-weight:500;">Đến ngày:</span>
              <input type="date" id="hs-to" value="${customTo}" style="${inputStyle}" onchange="${filterOnChange}">
            </div>
          </div>
        </div>
    `;

    const hasData = (loaiDiem === 'xu_ly' && xuLyRows.length > 0) || (loaiDiem === 'luong' && luongRows.length > 0);
    if (!hasData) {
      html += `<div style="text-align: center; color: var(--clr-text-light); padding: 40px; background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm);">Không có dữ liệu trong khoảng thời gian này</div></div>`;
      content.innerHTML = html;
      return;
    }

    // Biểu đồ so sánh
    const maxScore = designerList.length > 0 ? Math.max(...designerList.map(d => loaiDiem === 'xu_ly' ? d.tongDiemXuLy : d.tongDiemLuong)) : 0;
    
    html += `
        <div class="card" style="margin-bottom: 24px;">
          <div class="card-header">
            <h3>Biểu Đồ Xếp Hạng (${loaiDiem === 'xu_ly' ? 'Điểm Xử Lý' : 'Điểm Lương'})</h3>
          </div>
          <div style="padding: 24px;">
    `;
    
    if (maxScore === 0) {
      html += `<div style="text-align: center; color: var(--clr-text-light);">Chưa có dữ liệu biểu đồ</div>`;
    } else {
      designerList.forEach(d => {
        const score = loaiDiem === 'xu_ly' ? d.tongDiemXuLy : d.tongDiemLuong;
        if (score <= 0) return; // Chỉ hiện người có điểm
        const percent = (score / maxScore) * 100;
        
        html += `
            <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 16px;">
              <div style="width: 150px; text-align: right; font-weight: 600; color: var(--clr-text); font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${this._escHtml(d.ten)}">
                ${this._escHtml(d.ten)}
              </div>
              <div style="flex: 1; height: 24px; background: #D8CBB8; border-radius: 12px; overflow: hidden; display: flex; align-items: center; border: 1px solid #B7A88F;">
                <div style="width: ${percent}%; height: 100%; background: #8C7355; border-radius: 12px;"></div>
              </div>
              <div style="width: 60px; font-weight: 700; color: #8C7355; font-size: 14px;">
                ${this._formatNumber(score)}
              </div>
            </div>
        `;
      });
    }
    
    html += `</div></div>`;

    // Bảng tổng hợp
    html += `
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Bảng Tổng Hợp Hiệu Suất (${loaiDiem === 'xu_ly' ? 'Điểm Xử Lý' : 'Điểm Lương'})</h3>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Tên Designer</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:center;">${loaiDiem === 'xu_ly' ? 'Số đơn xử lý' : 'Số đơn tính lương'}</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">${loaiDiem === 'xu_ly' ? 'Tổng điểm xử lý' : 'Tổng điểm lương'}</th>
                </tr>
              </thead>
              <tbody>
    `;
    designerList.forEach(d => {
      html += `
                <tr class="table-row-hover">
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); font-weight:600; text-align:left;">${this._escHtml(d.ten)}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:center;">${loaiDiem === 'xu_ly' ? d.soDonXuLy.size : d.soDonLuong.size}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; color: ${loaiDiem === 'xu_ly' ? 'var(--clr-primary)' : '#8E44AD'}; font-weight: 600;">${this._formatNumber(loaiDiem === 'xu_ly' ? d.tongDiemXuLy : d.tongDiemLuong)}</td>
                </tr>
      `;
    });
    html += `
              </tbody>
            </table>
          </div>
        </div>
    `;

    // 3. Danh sách đơn chi tiết
    if (loaiDiem === 'xu_ly') {
      html += `
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Chi Tiết: Đơn Xử Lý</h3>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Ngày ghi nhận</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Mã Đơn</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Designer</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Điểm Xử Lý</th>
                </tr>
              </thead>
              <tbody>
      `;
      [...xuLyRows].reverse().forEach(r => {
        html += `
                <tr class="table-row-hover">
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ngay_ghi_nhan || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left; font-weight:500;"><a href="#" style="color:var(--clr-primary); text-decoration:none; border-bottom:1px solid var(--clr-primary);" onclick="App._moDonTuBaoCao('${this._escHtml(r.ma_don || '')}'); return false;" title="Mở chi tiết đơn">${this._escHtml(r.ma_don || '')}</a></td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ten_designer || r.designer || r.ho_ten || r.ten || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600;">${this._escHtml(r.diem_tam || '')}</td>
                </tr>
        `;
      });
      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Chi Tiết: Đơn Tính Lương</h3>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Ngày ghi nhận</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Mã Đơn</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Designer</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Điểm Lương</th>
                </tr>
              </thead>
              <tbody>
      `;
      [...luongRows].reverse().forEach(r => {
        html += `
                <tr class="table-row-hover">
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ngay_ghi_nhan || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left; font-weight:500;"><a href="#" style="color:var(--clr-primary); text-decoration:none; border-bottom:1px solid var(--clr-primary);" onclick="App._moDonTuBaoCao('${this._escHtml(r.ma_don || '')}'); return false;" title="Mở chi tiết đơn">${this._escHtml(r.ma_don || '')}</a></td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ten_designer || r.designer || r.ho_ten || r.ten || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600;">${this._escHtml(r.diem || '')}</td>
                </tr>
        `;
      });
      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    content.innerHTML = html;
  },

  _moDonTuBaoCao(maDon) {
    if (!maDon) return;
    console.log(`[DEBUG mo don tu bao cao] mã đơn: ${maDon}`);
    this._popupReturnScreen = this.currentPage;
    this.navigateTo('kanban');
    
    // Đợi kanban load data xong rồi mở thẻ
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      // Nếu đã có kanbanData (fetch xong) và có chứa mã đơn này
      if (this._kanbanData && this._kanbanData.some(d => d.ma_don === maDon)) {
        clearInterval(interval);
        this._openCardDetail(maDon);
      } else if (attempts > 50) { 
        // Sau 10 giây (50 * 200ms) nếu không thấy đơn thì hủy (đơn có thể đã bị xóa)
        clearInterval(interval);
        this._popupReturnScreen = null;
      }
    }, 200);
  },

  // ════════════════════════════════════════════════════════════
  //  HIEU SUAT SALE PAGE
  // ════════════════════════════════════════════════════════════

  async renderHieuSuatSalePage() {
    const role = this.session?.role;
    const content = document.getElementById('page-content');

    if (role === 'designer') {
      content.innerHTML = '<div style="padding:40px; text-align:center; color:var(--clr-error);">Bạn không có quyền truy cập trang này.</div>';
      return;
    }

    content.innerHTML = '<div class="kb-loading"><div class="spinner"></div> Đang tải dữ liệu báo cáo...</div>';

    try {
      // 1. Đọc dữ liệu
      let [donHangList, tienDonRows, cauHinhList] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG).catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.KPI_SALE).catch(() => [])
      ]);
      donHangList = (donHangList || []).filter(d => d.da_an !== 'yes');
      
      const tienDonMap = {};
      tienDonRows.forEach(r => { if(r.ma_don) tienDonMap[r.ma_don] = r.tong_gia_tri; });
      donHangList.forEach(d => { if (tienDonMap[d.ma_don] !== undefined) d.tong_gia_tri = tienDonMap[d.ma_don]; });

      this._hsSaleDonHangList = donHangList;
      this._hsSaleCauHinhList = cauHinhList;

      // Render nội dung ban đầu (mặc định: tháng này, tab kpi)
      this._renderHieuSuatSaleContent('kpi', 'month', '', '');
    } catch (e) {
      console.error(e);
      content.innerHTML = `<div style="padding:24px; color:red; text-align:center;">Lỗi tải dữ liệu: ${e.message}</div>`;
    }
  },

  _renderHieuSuatSaleContent(tabId, filterType = 'month', customFrom = '', customTo = '') {
    const content = document.getElementById('page-content');
    
    // Parse filter type
    let fType = filterType;
    let cFrom = customFrom;
    let cTo = customTo;
    
    // Không lấy từ DOM nữa vì state đã được truyền thẳng vào qua tham số fType, cFrom, cTo

    const today = new Date();
    let startDate = new Date(0);
    let endDate = new Date('2999-12-31');
    let isFullMonth = false;

    if (fType === 'week') {
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1);
      startDate = new Date(today.getFullYear(), today.getMonth(), diff, 0, 0, 0);
      endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6, 23, 59, 59);
    } else if (fType === 'month') {
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);
      isFullMonth = true;
    } else if (fType === 'year') {
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59);
    } else if (fType === 'custom') {
      startDate = cFrom ? new Date(cFrom + 'T00:00:00') : new Date(0);
      endDate = cTo ? new Date(cTo + 'T23:59:59') : new Date('2999-12-31');
      // Check if it's exactly one full month
      if (cFrom && cTo) {
         const sM = startDate.getMonth();
         const sY = startDate.getFullYear();
         const eM = endDate.getMonth();
         const eY = endDate.getFullYear();
         const sD = startDate.getDate();
         const eD = endDate.getDate();
         const lastDay = new Date(sY, sM + 1, 0).getDate();
         
         if (sY === eY && sM === eM && sD === 1 && eD === lastDay) {
            isFullMonth = true;
         }
      }
    }

    // Convert string to Date for filtering (dd/MM/yyyy)
    const parseNgayThuDu = (dateStr) => {
      const parts = dateStr.trim().split('/');
      if (parts.length < 2) return null;
      let d = 1, m, y;
      if (parts.length === 2) { 
         d = 1;
         m = parseInt(parts[0], 10);
         y = parseInt(parts[1], 10);
      } else {
         d = parseInt(parts[0], 10);
         m = parseInt(parts[1], 10);
         y = parseInt(parts[2], 10);
      }
      return new Date(y, m - 1, d);
    };

    // Lọc đơn hợp lệ trong khoảng
    const validOrdersInMonth = (this._hsSaleDonHangList || []).filter(d => {
      const tt = (d.trang_thai || '').toLowerCase();
      if (tt.includes('hủy') || tt.includes('huy')) return false;
      const ngayThuDu = (d.ngay_thu_du || '').trim();
      if (!ngayThuDu) return false;
      
      const orderDate = parseNgayThuDu(ngayThuDu);
      if (!orderDate) return false;
      
      // [Đã gỡ bỏ: Lọc đơn hàng theo sessionTen để sale nạp 100% đơn công ty]

      return orderDate >= startDate && orderDate <= endDate;
    });

    console.log(`[DEBUG filter sale] chế độ: ${fType}, từ ${startDate.toLocaleDateString('vi-VN')} đến ${endDate.toLocaleDateString('vi-VN')}, số đơn: ${validOrdersInMonth.length}`);

    const cauHinhList = this._hsSaleCauHinhList || [];
    const salesPerformance = [];
    const saleOrdersMap = {};

    cauHinhList.forEach(nhanVien => {
      const loaiLuong = (nhanVien.loai_luong || '').trim().toLowerCase();
      if (loaiLuong !== 'sale') return;
      
      const hoTen = (nhanVien.ho_ten || '').trim();
      if (!hoTen) return;

      // [Đã gỡ bỏ: Lọc ẩn KPI người khác để các sale thi đua]

      const kpiDoanhSo = this._parseCurrency(nhanVien.kpi_doanh_so);
      const saleOrders = validOrdersInMonth.filter(d => (d.sale_phu_trach || '').trim().toLowerCase() === hoTen.toLowerCase());
      const totalThuongRevenue = saleOrders.reduce((sum, d) => sum + this._tinhSoPhaiThu(d), 0);
      
      let ptDat = 0;
      if (kpiDoanhSo > 0) {
         ptDat = (totalThuongRevenue / kpiDoanhSo) * 100;
      }

      salesPerformance.push({
        ten: hoTen,
        doanhSo: totalThuongRevenue,
        kpi: kpiDoanhSo,
        ptDat: ptDat
      });
      saleOrdersMap[hoTen] = saleOrders;
    });

    salesPerformance.sort((a, b) => b.doanhSo - a.doanhSo);

    // Styles
    const btnStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-border-light); background:var(--clr-surface); cursor:pointer; font-size:14px; font-weight:500; color:var(--clr-text); transition:all 0.2s;";
    const btnActiveStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-accent); background:var(--clr-accent); color:#fff; cursor:pointer; font-size:14px; font-weight:500; transition:all 0.2s;";
    const inputStyle = "padding:8px 12px; border-radius:8px; border:1px solid var(--clr-border-light); font-size:14px; background:var(--clr-surface); outline:none;";

    let html = `
      <div style="max-width: 1200px; margin: 0 auto; display:flex; flex-direction:column; gap:24px;">
        
        <!-- BỘ LỌC & TABS -->
        <div style="background:var(--clr-card); padding:20px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); display:flex; flex-direction:column; gap:20px;">
          
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <!-- Tab Chọn loại -->
            <div style="display:flex; gap:12px;">
              <button style="${tabId === 'kpi' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatSaleContent('kpi', '${fType}', '${cFrom}', '${cTo}')">Doanh số KPI</button>
              <button style="${tabId === 'support' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatSaleContent('support', '${fType}', '${cFrom}', '${cTo}')">Doanh số Support</button>
            </div>
            
            <!-- Lọc thời gian -->
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
              <div style="display:flex; gap:8px;">
                <button style="${fType === 'week' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatSaleContent('${tabId}', 'week')">Tuần này</button>
                <button style="${fType === 'month' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatSaleContent('${tabId}', 'month')">Tháng này</button>
                <button style="${fType === 'year' ? btnActiveStyle : btnStyle}" onclick="App._renderHieuSuatSaleContent('${tabId}', 'year')">Năm nay</button>
              </div>
              <div id="hs-sale-date" style="display:flex; gap:8px; align-items:center; margin-left:8px; padding-left:16px; border-left:1px solid var(--clr-border-light);">
                <input type="date" id="hs-sale-custom-from" style="${inputStyle}" value="${cFrom}" onchange="const to = document.getElementById('hs-sale-custom-to').value; if(this.value && to) App._renderHieuSuatSaleContent('${tabId}', 'custom', this.value, to)">
                <span style="color:var(--clr-text-muted);">đến</span>
                <input type="date" id="hs-sale-custom-to" style="${inputStyle}" value="${cTo}" onchange="const from = document.getElementById('hs-sale-custom-from').value; if(from && this.value) App._renderHieuSuatSaleContent('${tabId}', 'custom', from, this.value)">
                <input type="hidden" id="hs-sale-filter-type" value="${fType}">
              </div>
            </div>
          </div>
        </div>
    `;

    if (tabId === 'kpi') {
      if (salesPerformance.length === 0) {
        html += `<div style="text-align: center; color: var(--clr-text-light); padding: 40px; background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm);">Không có cấu hình nhân sự Sale nào</div>`;
      } else {
        // Biểu đồ so sánh
        const maxDoanhSo = Math.max(...salesPerformance.map(s => s.doanhSo), 0);
        const chartColors = ['#8C7355', '#B7A88F', '#D8CBB8'];
        
        if (maxDoanhSo > 0) {
          html += `
            <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px; padding: 20px;">
              <h3 style="margin:0 0 20px 0; font-size:16px; font-weight:600;">Biểu đồ So Sánh Doanh Số</h3>
              <div style="display:flex; flex-direction:column; gap:16px;">
          `;
          
          salesPerformance.forEach((s, idx) => {
            const widthPercent = (s.doanhSo / maxDoanhSo) * 100;
            const barColor = chartColors[idx % chartColors.length];
            
            html += `
                <div style="display:flex; flex-direction:column; gap:6px;">
                  <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; color:var(--clr-text);">
                    <span>${this._escHtml(s.ten)}</span>
                    <span>${this._formatVND(s.doanhSo)}</span>
                  </div>
                  <div style="width:100%; height:12px; background:rgba(0,0,0,0.05); border-radius:6px; overflow:hidden;">
                    <div style="width:${widthPercent}%; height:100%; background:${barColor}; border-radius:6px; transition:width 0.5s ease-out;"></div>
                  </div>
                </div>
            `;
          });
          
          html += `
              </div>
            </div>
          `;
        }

        // Bảng tổng hợp KPI
        html += `
          <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
            <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
              <h3 style="margin:0; font-size:16px; font-weight:600;">Tổng hợp Doanh số KPI ${isFullMonth ? '' : '<span style="font-size:12px; font-weight:400; color:var(--clr-text-muted); margin-left:8px;">(Chỉ tính KPI khi lọc đủ nguyên 1 tháng)</span>'}</h3>
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                  <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Tên Sale</th>
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Doanh số riêng</th>
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">KPI</th>
                    ${isFullMonth ? '<th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">% Đạt</th>' : ''}
                  </tr>
                </thead>
                <tbody>
        `;
        salesPerformance.forEach(s => {
          const isPass = s.ptDat >= 80;
          const color = isPass ? 'var(--clr-primary)' : '#E74C3C';
          html += `
                  <tr class="table-row-hover">
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); font-weight:600; text-align:left;">${this._escHtml(s.ten)}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600;">${this._formatVND(s.doanhSo)}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600; color:var(--clr-text-muted);">${this._formatVND(s.kpi)}</td>
                    ${isFullMonth ? `<td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:700; color:${color};">${s.ptDat.toFixed(1)}%</td>` : ''}
                  </tr>
          `;
        });
        html += `</tbody></table></div></div>`;

        // Danh sách đơn chốt
        html += `
          <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
            <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
              <h3 style="margin:0; font-size:16px; font-weight:600;">Danh Sách Đơn Chốt</h3>
            </div>
            <div style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; font-size:14px;">
                <thead>
                  <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Ngày thu đủ</th>
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Mã Đơn</th>
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Sale Phụ Trách</th>
                    <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Giá trị</th>
                  </tr>
                </thead>
                <tbody>
        `;
        
        let hasOrder = false;
        salesPerformance.forEach(s => {
          const orders = saleOrdersMap[s.ten] || [];
          orders.forEach(r => {
            hasOrder = true;
            html += `
                  <tr class="table-row-hover">
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ngay_thu_du || '')}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left; font-weight:500;"><a href="#" style="color:var(--clr-primary); text-decoration:none; border-bottom:1px solid var(--clr-primary);" onclick="App._moDonTuBaoCao('${this._escHtml(r.ma_don || '')}'); return false;" title="Mở chi tiết đơn">${this._escHtml(r.ma_don || '')}</a></td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(s.ten)}</td>
                    <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600;">${this._formatVND(this._tinhSoPhaiThu(r))}</td>
                  </tr>
            `;
          });
        });

        if (!hasOrder) {
          html += `<tr><td colspan="4" style="text-align: center; color: var(--clr-text-muted); padding: 32px;">Không có đơn nào trong khoảng thời gian này</td></tr>`;
        }

        html += `</tbody></table></div></div>`;
      }
    } else {
      // support tab
      const totalCompanyRevenue = validOrdersInMonth.reduce((sum, d) => sum + this._tinhSoPhaiThu(d), 0);
      const supportStaffs = (this._hsSaleCauHinhList || []).filter(n => (n.loai_luong || '').trim().toLowerCase() === 'support');
      
      html += `
        <div style="background:var(--clr-card); padding:24px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); margin-bottom:24px;">
          <h3 style="margin:0 0 16px 0; font-size:16px; font-weight:600; color:var(--clr-text);">Tổng Hợp Doanh Thu Công Ty (Tính Support)</h3>
          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:16px;">
            <div style="background:linear-gradient(135deg, #EDE7F6, #F3EFFB); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm); display:flex; flex-direction:column; justify-content:center;">
              <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">Tổng Doanh Thu Đã Thu Đủ</div>
              <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatVND(totalCompanyRevenue)}</div>
              <div style="font-size:13px; color:var(--clr-text-muted); margin-top:8px;">Từ tất cả các đơn hàng hợp lệ trong khoảng thời gian</div>
            </div>
      `;

      if (supportStaffs.length > 0) {
        supportStaffs.forEach(staff => {
          const ptSupport = parseFloat(staff.phan_tram_support) || 0;
          const thuongSupport = totalCompanyRevenue * (ptSupport / 100);
          html += `
            <div style="background:linear-gradient(135deg, #FFF0E5, #FFF6EF); padding:20px; border-radius:20px; box-shadow:var(--shadow-sm); display:flex; flex-direction:column; justify-content:center;">
              <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; font-weight:600; letter-spacing:0.5px; margin-bottom:8px;">${this._escHtml(staff.ho_ten)}</div>
              <div style="font-size:28px; font-weight:800; color:#2A2420;">${this._formatVND(thuongSupport)}</div>
              <div style="font-size:13px; color:var(--clr-text-muted); margin-top:8px;">Thưởng Support (${ptSupport}%)</div>
            </div>
          `;
        });
      }

      html += `
          </div>
        </div>
      `;

      // Order List
      html += `
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden; margin-bottom: 24px;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Danh Sách Tất Cả Đơn Hợp Lệ (Toàn Công Ty)</h3>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Ngày thu đủ</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Mã Đơn</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Sale Phụ Trách</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Giá trị</th>
                </tr>
              </thead>
              <tbody>
      `;
      
      if (validOrdersInMonth.length === 0) {
        html += `<tr><td colspan="4" style="text-align: center; color: var(--clr-text-muted); padding: 32px;">Không có đơn nào trong khoảng thời gian này</td></tr>`;
      } else {
        validOrdersInMonth.forEach(r => {
          html += `
                <tr class="table-row-hover">
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.ngay_thu_du || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left; font-weight:500;"><a href="#" style="color:var(--clr-primary); text-decoration:none; border-bottom:1px solid var(--clr-primary);" onclick="App._moDonTuBaoCao('${this._escHtml(r.ma_don || '')}'); return false;" title="Mở chi tiết đơn">${this._escHtml(r.ma_don || '')}</a></td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:left;">${this._escHtml(r.sale_phu_trach || '')}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:600;">${this._formatVND(this._tinhSoPhaiThu(r))}</td>
                </tr>
          `;
        });
      }

      html += `</tbody></table></div></div>`;
    }

    html += `</div>`;
    content.innerHTML = html;
  },

  _showChiTietHoan() {
    if (!this._doanhThuCurrentFilteredData) return;
    
    // 1. Lọc giao dịch hoàn trong kỳ
    const hoanList = this._doanhThuCurrentFilteredData.filter(r => r.so_tien < 0);
    
    let totalHoan = 0;
    
    // 2. Build HTML cho từng dòng
    const htmlRows = hoanList.map(r => {
      const tienHoan = Math.abs(r.so_tien);
      totalHoan += tienHoan;
      
      let khachHang = 'Không rõ';
      if (this._doanhThuDonHangList) {
         const don = this._doanhThuDonHangList.find(d => d.ma_don === r.ma_don);
         if (don) {
            khachHang = don.ten_khach_hang || don.ten_khach || don.brand || 'Không rõ';
         }
      }
      
      return `
        <tr>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); font-weight:600; color:#4A4036;">${this._escHtml(r.ma_don || '')}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); color:#5C544D;">${this._escHtml(khachHang)}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); color:#C62828; font-weight:700; text-align:right;">${this._formatVND(tienHoan)}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); text-align:right; color:#8A724C;">${this._escHtml(r.ngay || '')}</td>
        </tr>
      `;
    }).join('');

    const emptyHtml = `<tr><td colspan="4" style="text-align:center; padding:48px 16px; color:#8A724C; font-style:italic;">Kỳ này không có khoản hoàn nào.</td></tr>`;

    // 3. Dựng cấu trúc Popup
    const modalHtml = `
      <div id="modal-chitiet-hoan" style="position:fixed; inset:0; background:rgba(42,36,32,0.4); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:24px; animation:fadeIn 0.25s ease-out;">
        <div style="background:#FAF8F5; width:100%; max-width:800px; border-radius:24px; box-shadow:0 24px 48px rgba(42,36,32,0.12), 0 0 0 1px rgba(138,114,76,0.1); display:flex; flex-direction:column; max-height:90vh; overflow:hidden;">
          
          <div style="padding:24px 32px; background:linear-gradient(to right, #FAF8F5, #FFF); display:flex; justify-content:space-between; align-items:center; position:relative;">
            <h3 style="margin:0; font-size:20px; color:#2A2420; font-weight:800; letter-spacing:-0.3px;">Chi tiết hoàn tiền</h3>
            <button onclick="document.getElementById('modal-chitiet-hoan').remove()" style="background:rgba(138,114,76,0.08); border:none; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#8A724C; transition:all 0.2s;" onmouseover="this.style.background='rgba(138,114,76,0.15)'" onmouseout="this.style.background='rgba(138,114,76,0.08)'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div style="padding:0 32px 16px 32px; background:linear-gradient(to right, #FAF8F5, #FFF);">
            <div style="background:linear-gradient(135deg, #FFF6EF, #FDF0F4); border-radius:12px; padding:12px 16px; display:flex; gap:12px; align-items:flex-start; box-shadow:inset 0 0 0 1px rgba(138,114,76,0.1);">
              <div style="color:#8A724C; margin-top:2px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              </div>
              <div style="font-size:13px; color:#5C544D; line-height:1.5;">Khoản hoàn được ghi nhận vào tháng thực hiện hoàn tiền (theo ngày hoàn), không điều chỉnh ngược lại doanh thu tháng phát sinh đơn.</div>
            </div>
          </div>
          
          <div style="flex:1; overflow-y:auto; padding:0 32px 16px 32px; background:#FFF;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead style="position:sticky; top:0; z-index:2; background:#FFF;">
                <tr>
                  <th style="padding:12px 24px; text-align:left; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Mã đơn</th>
                  <th style="padding:12px 24px; text-align:left; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Khách hàng</th>
                  <th style="padding:12px 24px; text-align:right; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Số tiền hoàn</th>
                  <th style="padding:12px 24px; text-align:right; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Ngày hoàn</th>
                </tr>
              </thead>
              <tbody>
                ${hoanList.length > 0 ? htmlRows : emptyHtml}
              </tbody>
            </table>
          </div>
          
          <div style="padding:24px 32px; background:linear-gradient(to right, #FFEBEE, #FDE0E4); display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; color:#C62828; font-size:14px; text-transform:uppercase; letter-spacing:0.5px;">Tổng tiền hoàn</div>
            <div style="font-weight:800; color:#B71C1C; font-size:24px;">${this._formatVND(totalHoan)}</div>
          </div>
          
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  _showDonKhongDong() {
    const list = this._zeroValueOrdersFiltered || [];
    
    // Build HTML cho từng dòng
    const htmlRows = list.map(don => {
      const isCancelled = don.trang_thai && don.trang_thai.toLowerCase().startsWith('hủy');
      const khachHang = don.ten_khach_hang || don.ten_khach || don.brand || 'Không rõ';
      const sale = don.sale_phu_trach || 'Không rõ';
      const trangThaiHtml = isCancelled 
        ? `<span style="color:#D32F2F; font-weight:700; background:rgba(211,47,47,0.1); padding:4px 8px; border-radius:4px;">${this._escHtml(don.trang_thai)}</span>`
        : `<span style="color:#388E3C; font-weight:600;">${this._escHtml(don.trang_thai || 'Đang chạy')}</span>`;
        
      return `
        <tr>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); font-weight:600; color:#4A4036;">${this._escHtml(don.ma_don || '')}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); color:#5C544D;">${this._escHtml(khachHang)}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); color:#1565C0; font-weight:600;">${this._escHtml(sale)}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); text-align:right; color:#8A724C;">${this._escHtml(don.ngay_len_don || don.ngay_tao || '')}</td>
          <td style="padding:16px 24px; border-bottom:1px solid rgba(138,114,76,0.1); text-align:right;">${trangThaiHtml}</td>
        </tr>
      `;
    }).join('');

    const emptyHtml = `<tr><td colspan="5" style="text-align:center; padding:48px 16px; color:#8A724C; font-style:italic;">Không có đơn giá trị 0đ nào.</td></tr>`;

    // Dựng cấu trúc Popup
    const modalHtml = `
      <div id="modal-don-khong-dong" style="position:fixed; inset:0; background:rgba(42,36,32,0.4); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; padding:24px; animation:fadeIn 0.25s ease-out;">
        <div style="background:#FAF8F5; width:100%; max-width:900px; border-radius:24px; box-shadow:0 24px 48px rgba(42,36,32,0.12), 0 0 0 1px rgba(138,114,76,0.1); display:flex; flex-direction:column; max-height:90vh; overflow:hidden;">
          
          <div style="padding:24px 32px; background:linear-gradient(to right, #FAF8F5, #FFF); display:flex; justify-content:space-between; align-items:center; position:relative;">
            <h3 style="margin:0; font-size:20px; color:#2A2420; font-weight:800; letter-spacing:-0.3px;">Chi tiết Đơn giá trị 0đ</h3>
            <button onclick="document.getElementById('modal-don-khong-dong').remove()" style="background:rgba(138,114,76,0.08); border:none; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:#8A724C; transition:all 0.2s;" onmouseover="this.style.background='rgba(138,114,76,0.15)'" onmouseout="this.style.background='rgba(138,114,76,0.08)'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          
          <div style="padding:0 32px 16px 32px; background:linear-gradient(to right, #FAF8F5, #FFF);">
            <div style="background:linear-gradient(135deg, #FFEBEE, #FDE0E4); border-radius:12px; padding:12px 16px; display:flex; gap:12px; align-items:flex-start; box-shadow:inset 0 0 0 1px rgba(229,115,115,0.3);">
              <div style="color:#C62828; margin-top:2px;">
                <span style="font-size:16px;">⚠️</span>
              </div>
              <div style="font-size:13px; color:#B71C1C; line-height:1.5;">Rà soát các đơn giá trị 0đ để đảm bảo không bỏ sót doanh thu (tránh trường hợp sale đổi trạng thái hủy để giấu doanh thu).</div>
            </div>
          </div>
          
          <div style="flex:1; overflow-y:auto; padding:0 32px 16px 32px; background:#FFF;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead style="position:sticky; top:0; z-index:2; background:#FFF;">
                <tr>
                  <th style="padding:12px 24px; text-align:left; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Mã đơn</th>
                  <th style="padding:12px 24px; text-align:left; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Khách hàng</th>
                  <th style="padding:12px 24px; text-align:left; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Sale phụ trách</th>
                  <th style="padding:12px 24px; text-align:right; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Ngày lên đơn</th>
                  <th style="padding:12px 24px; text-align:right; font-weight:600; color:#8A724C; text-transform:uppercase; font-size:11px; letter-spacing:0.5px; border-bottom:1px solid rgba(138,114,76,0.15);">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                ${list.length > 0 ? htmlRows : emptyHtml}
              </tbody>
            </table>
          </div>
          
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  },

  // ════════════════════════════════════════════════════════════
  //  CONG NO PAGE
  // ════════════════════════════════════════════════════════════

  async renderCongNoPage() {
    const content = document.getElementById('page-content');
    content.innerHTML = `<div class="loading-indicator"><div class="spinner"></div><div style="margin-top:10px; color:var(--clr-text-muted);">Đang tải dữ liệu công nợ...</div></div>`;
    
    try {
      const [orders, tienDonList, giaoDichTienList] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG).catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => []),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.GIAO_DICH_TIEN, 'A:E').catch(() => [])
      ]);
      
      this._giaoDichTienList = giaoDichTienList;
      
      
      const tienDonMap = {};
      tienDonList.forEach(t => {
         if (t.ma_don) tienDonMap[t.ma_don] = t;
      });
      
      this._congNoDonHangList = orders.map(d => {
         const t = tienDonMap[d.ma_don];
         return {
            ...d,
            tong_gia_tri: t?.tong_gia_tri || d.tong_gia_tri
         };
      });

      this._renderCongNoContent('dang_no');

    } catch (error) {
      console.error(error);
      content.innerHTML = `<div style="color:var(--clr-error); padding:20px; text-align:center;">Lỗi tải dữ liệu công nợ: ${error.message}</div>`;
    }
  },

  _renderCongNoContent(statusFilter = 'dang_no', customerFilter = '') {
    const content = document.getElementById('page-content');
    if (!content) return;
    
    const today = new Date();
    
    // Convert string to Date and get Month Group
    const getMonthGroup = (dateStr) => {
      if (!dateStr) return { id: '0000-00', name: 'Không rõ tháng' };
      const parts = dateStr.trim().split('/');
      if (parts.length < 2) return { id: '0000-00', name: 'Không rõ tháng' };
      let m, y;
      if (parts.length === 2) { 
         m = parseInt(parts[0], 10); y = parseInt(parts[1], 10);
      } else {
         m = parseInt(parts[1], 10); y = parseInt(parts[2], 10);
         if (isNaN(y) || y < 2000) y = today.getFullYear();
      }
      if (isNaN(m) || isNaN(y)) return { id: '0000-00', name: 'Không rõ tháng' };
      const sm = m < 10 ? '0' + m : m;
      return { id: `${y}-${sm}`, name: `Tháng ${sm}/${y}` };
    };

    // Prepare list of debts
    let debtList = [];
    let groupedDebts = {};
    let customerListMap = {};
    
    (this._congNoDonHangList || []).forEach(don => {
       const maDon = don.ma_don;
       if (!maDon) return;
       if (don.da_an === 'yes') return;
       
       const isCancelled = don.trang_thai && don.trang_thai.toLowerCase().startsWith('hủy');
       
       // Filter status
       if (statusFilter === 'dang_no' && isCancelled) return;
       if (statusFilter === 'don_huy' && !isCancelled) return;
       
       // Get month group
       const monthGroup = getMonthGroup(don.ngay_len_don || don.ngay_tao || '');
       
       // Calculate daThucThu
       const giaoDichList = (this._giaoDichTienList || []).filter(g => g.ma_don === maDon);
       let daThucThu = 0;
       giaoDichList.forEach(g => {
          const tien = App._parseCurrency(g.so_tien);
          if (!isNaN(tien)) daThucThu += tien;
       });
       
       const tongGiaTri = App._parseCurrency(don.tong_gia_tri);
       const soPhaiThu = App._tinhSoPhaiThu(don);
       let conNo = soPhaiThu - daThucThu;
       if (conNo <= 0) conNo = 0;
       
       if (conNo > 0) {
          let statusText = 'Đang chạy';
          if (isCancelled) statusText = 'Đã hủy';
          else if (don.cot_kanban === 'Hoàn thành đơn' && soPhaiThu > 0 && daThucThu >= soPhaiThu) statusText = 'Hoàn thành';
          
          const maKh = don.ma_khach_hang || don.ma_kh || '';
          const khachHang = don.ten_khach_hang || don.ten_khach || don.brand || '';
          
          if (maKh && !customerListMap[maKh]) {
             customerListMap[maKh] = khachHang || maKh;
          }

          if (customerFilter && maKh !== customerFilter) return;

          const item = {
             ma_don: maDon,
             ma_kh: maKh,
             khach_hang: khachHang,
             tong_gia_tri: tongGiaTri,
             da_thuc_thu: daThucThu,
             con_no: conNo,
             trang_thai: statusText,
             month_id: monthGroup.id
          };
          
          debtList.push(item);
          
          if (!groupedDebts[monthGroup.id]) {
             groupedDebts[monthGroup.id] = { name: monthGroup.name, id: monthGroup.id, total: 0, items: [] };
          }
          groupedDebts[monthGroup.id].items.push(item);
          groupedDebts[monthGroup.id].total += conNo;
       }
    });
    
    // Sort items inside groups
    Object.values(groupedDebts).forEach(g => g.items.sort((a, b) => b.con_no - a.con_no));
    
    // Sort groups by id (YYYY-MM) descending
    const groupKeys = Object.keys(groupedDebts).sort((a, b) => b.localeCompare(a));
    
    const totalDebt = debtList.reduce((sum, d) => sum + d.con_no, 0);

    const customers = Object.keys(customerListMap).map(ma => ({ ma, ten: customerListMap[ma] }));
    customers.sort((a, b) => a.ten.localeCompare(b.ten));

    let customerOptions = `<option value="">Tất cả khách hàng</option>`;
    customers.forEach(c => {
       const selected = c.ma === customerFilter ? 'selected' : '';
       customerOptions += `<option value="${this._escHtml(c.ma)}" ${selected}>${this._escHtml(c.ma)} - ${this._escHtml(c.ten)}</option>`;
    });

    const btnStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-border-light); background:var(--clr-surface); cursor:pointer; font-size:14px; font-weight:500; color:var(--clr-text); transition:all 0.2s;";
    const btnActiveStyle = "padding:8px 16px; border-radius:20px; border:1px solid var(--clr-accent); background:var(--clr-accent); color:#fff; cursor:pointer; font-size:14px; font-weight:500; transition:all 0.2s;";
    const selectStyle = "padding:8px 12px; border-radius:8px; border:1px solid var(--clr-border-light); font-size:14px; background:var(--clr-surface); outline:none;";
    
    let html = `
      <div id="cn-content-wrap" style="max-width: 1200px; margin: 0 auto; display:flex; flex-direction:column; gap:24px;">
        
        <!-- BỘ LỌC -->
        <div style="background:var(--clr-card); padding:20px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
          
          <div style="display:flex; gap:12px;">
            <button style="${statusFilter === 'dang_no' ? btnActiveStyle : btnStyle}" onclick="App._renderCongNoContent('dang_no', '${this._escHtml(customerFilter)}')">Đang nợ (chưa hủy)</button>
            <button style="${statusFilter === 'don_huy' ? btnActiveStyle : btnStyle}" onclick="App._renderCongNoContent('don_huy', '${this._escHtml(customerFilter)}')">Đơn hủy còn nợ</button>
          </div>
          
          <div style="display:flex; align-items:center; gap:8px;">
            <label style="font-size:14px; font-weight:500; color:var(--clr-text-muted);">Khách hàng:</label>
            <select style="${selectStyle}" onchange="App._renderCongNoContent('${statusFilter}', this.value)">
               ${customerOptions}
            </select>
          </div>
          
        </div>
        
        <!-- Ô TỔNG -->
        <div style="background:var(--clr-card); padding:24px; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm);">
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:13px; color:var(--clr-text-muted); text-transform:uppercase; letter-spacing:0.05em;">Tổng Công Nợ</div>
            <div style="font-size:32px; font-weight:800; color:#B4453C;">${this._formatVND(totalDebt)}</div>
            <div style="font-size:13px; color:var(--clr-text-muted);">Thuộc ${debtList.length} đơn ${statusFilter === 'dang_no' ? 'đang chạy/hoàn thành' : 'đã hủy'}</div>
          </div>
        </div>
        
        <!-- BẢNG -->
        <div style="background:var(--clr-card); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); overflow:hidden;">
          <div style="padding:20px; border-bottom:1px solid var(--clr-border-light);">
            <h3 style="margin:0; font-size:16px; font-weight:600;">Danh Sách Đơn Còn Nợ</h3>
          </div>
          <div class="cn-table-wrap" style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:14px;">
              <thead>
                <tr style="background:rgba(0,0,0,0.02); color:var(--clr-text-muted); font-size:12px; text-transform:uppercase; letter-spacing:0.05em; text-align:left;">
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Mã Đơn</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">Khách hàng</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Tổng giá trị</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Đã thực thu</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Còn nợ</th>
                  <th style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
    `;
    
    if (debtList.length === 0) {
       html += `<tr><td colspan="6" style="text-align: center; color: var(--clr-text-muted); padding: 40px;">Không có công nợ</td></tr>`;
    } else {
       groupKeys.forEach(key => {
          const group = groupedDebts[key];
          if (!group || group.items.length === 0) return;
          
          html += `
             <tr>
               <td colspan="6" style="padding:12px 20px; background:#FAF8F5; border-bottom:1px solid var(--clr-border-light); border-top:1px solid var(--clr-border-light);">
                 <div style="display:flex; justify-content:space-between; align-items:center;">
                   <span style="font-weight:700; color:#8A724C; font-size:14px;">${this._escHtml(group.name)}</span>
                   <span style="font-weight:600; color:#B4453C; font-size:13px;">Nợ nhóm: ${this._formatVND(group.total)}</span>
                 </div>
               </td>
             </tr>
          `;
          
          group.items.forEach(d => {
             html += `
                <tr class="table-row-hover">
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); font-weight:500;">
                    <a href="#" style="color:var(--clr-primary); text-decoration:none; border-bottom:1px solid var(--clr-primary);" 
                       onclick="App._popupReturnScreen = 'cong-no'; App._moDonTuBaoCao('${this._escHtml(d.ma_don)}'); return false;" title="Mở chi tiết đơn">
                       ${this._escHtml(d.ma_don)}
                    </a>
                  </td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light);">${this._escHtml(d.khach_hang)}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:500; color:var(--clr-text-muted);">${this._formatVND(d.tong_gia_tri)}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:500; color:var(--clr-text-muted);">${this._formatVND(d.da_thuc_thu)}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right; font-weight:700; color:#B4453C; background:rgba(180,69,60,0.03);">${this._formatVND(d.con_no)}</td>
                  <td style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); text-align:right;">
                    <span style="font-size:12px; font-weight:600; padding:4px 8px; border-radius:4px; ${d.trang_thai === 'Đã hủy' ? 'background:#FCE9E9; color:#B4453C;' : 'background:rgba(0,0,0,0.05); color:var(--clr-text-muted);'}">${d.trang_thai}</span>
                  </td>
                </tr>
             `;
          });
       });
    }

    html += `
              </tbody>
            </table>
          </div>
          
          <!-- KHỐI THẺ (MOBILE) -->
          <div class="cn-cards-wrap" style="padding: 12px;">
    `;
    
    if (debtList.length === 0) {
       html += `<div style="text-align: center; color: var(--clr-text-muted); padding: 20px;">Không có công nợ</div>`;
    } else {
       groupKeys.forEach(key => {
          const group = groupedDebts[key];
          if (!group || group.items.length === 0) return;
          
          html += `
             <div class="cn-card-group-title">
               <span style="color:#8A724C;">${this._escHtml(group.name)}</span>
               <span style="color:#B4453C;">Nợ nhóm: ${this._formatVND(group.total)}</span>
             </div>
          `;
          
          group.items.forEach(d => {
             html += `
                <div class="cn-card" onclick="App._popupReturnScreen = 'cong-no'; App._moDonTuBaoCao('${this._escHtml(d.ma_don)}'); return false;" style="cursor:pointer;">
                  <div class="cn-card-head">
                    <strong>${this._escHtml(d.ma_don)}</strong> &middot; ${this._escHtml(d.khach_hang)} 
                    <span class="cn-card-status" style="${d.trang_thai === 'Đã hủy' ? 'background:#FCE9E9; color:#B4453C;' : ''}">${d.trang_thai}</span>
                  </div>
                  <div style="font-size:13px; color:var(--clr-text-muted); margin-bottom:4px;">Tổng giá trị: ${this._formatVND(d.tong_gia_tri)} &middot; Đã thu: ${this._formatVND(d.da_thuc_thu)}</div>
                  <div style="font-size:14px; font-weight:700; color:#B4453C;">Còn nợ: ${this._formatVND(d.con_no)}</div>
                </div>
             `;
          });
       });
    }

    html += `
          </div>
        </div>
      </div>
    `;

    content.innerHTML = html;
  },

  // ════════════════════════════════════════════════════════════
  //  BANG LUONG PAGE
  // ════════════════════════════════════════════════════════════

  async renderBangLuongPage() {
    const content = document.getElementById('page-content');
    
    // 1. Dựng UI khung tĩnh trước
    const now = new Date();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const curYear = now.getFullYear();
    const defaultMonthYear = `${curYear}-${curMonth}`;

    content.innerHTML = `
      <div id="bl-header" class="page-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 24px;">
        <h1 style="margin:0; font-size: 24px; color: var(--clr-text); display:flex; align-items:center; gap:8px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/>
            <path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/>
            <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/>
          </svg>
          Bảng lương
        </h1>
        <div id="bl-controls" style="display:flex; gap:12px; align-items:center;">
          <input type="month" id="bl-month-picker" class="form-input" style="width: auto; padding: 6px 12px;" value="${defaultMonthYear}" />
          <button class="btn btn-primary" onclick="App.loadBangLuong()" style="padding: 6px 16px; border-radius: 16px;">Xem</button>
          ${this.session?.role === 'admin' ? `
            <button class="btn" onclick="App.showAddThuongRiengForm()" style="padding: 6px 16px; border-radius: 16px; background:#F5EFE6; color:#9C7E5E; border:1px solid #CBB799; font-weight:600; cursor:pointer;">+ Thưởng riêng</button>
            <button id="btn-chot-luong" class="btn btn-primary" onclick="App.chotLuong()" style="padding: 6px 16px; border-radius: 16px;">CHỐT & LƯU LƯƠNG</button>
          ` : ''}
        </div>
      </div>
      
      <div id="bl-loading" style="text-align:center; padding:40px; display:none;">
        <span class="spinner" style="width:24px; height:24px; border-width:3px; border-color:var(--clr-accent) transparent transparent transparent;"></span>
        <div style="margin-top:12px; color:var(--clr-text-muted);">Đang tính toán dữ liệu lương...</div>
      </div>

      <div id="bl-error" style="display:none; padding:16px; background:#FADBD8; color:#C0392B; border-radius:8px; margin-bottom:20px;"></div>
      
      <div id="bl-progress-container" style="margin-bottom:20px; display:none;"></div>

      <div id="bl-table-container" style="display:none; overflow-x:auto;">
        <table class="data-table" style="width: 100%; border-collapse: separate; border-spacing: 0 12px;">
          <thead style="background: #F5EFE6; color: #9C7E5E;">
            <tr>
              <th style="text-align:left; padding:16px; border-radius: 16px 0 0 16px;">Thông tin nhân sự</th>
              <th style="text-align:right; padding:16px;">Lương cơ bản</th>
              <th style="text-align:right; padding:16px;">Các khoản cộng thêm</th>
              <th style="text-align:right; padding:16px; border-radius: 0 16px 16px 0;">TỔNG LƯƠNG</th>
            </tr>
          </thead>
          <tbody id="bl-tbody"></tbody>
        </table>
      </div>
    `;

    // Gọi load data luôn
    await this.loadBangLuong();
  },

  async loadBangLuong() {
    const loading = document.getElementById('bl-loading');
    const tableCont = document.getElementById('bl-table-container');
    const errorCont = document.getElementById('bl-error');
    const tbody = document.getElementById('bl-tbody');
    const picker = document.getElementById('bl-month-picker');

    if (!loading || !picker) return;

    loading.style.display = 'block';
    tableCont.style.display = 'none';
    errorCont.style.display = 'none';
    tbody.innerHTML = '';

    try {
      // "2026-08" -> "08/2026"
      const [yearStr, monthStr] = picker.value.split('-');
      const targetMonthYear = `${monthStr}/${yearStr}`;
      
      if (this.session?.role !== 'admin') {
         const myEmail = (this.session?.email || '').trim().toLowerCase();
         // Lấy cấu hình ID file từ tab NHAN_SU
         const staffList = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.NHAN_SU).catch(() => []);
         const myStaffInfo = staffList.find(s => (s.email || '').trim().toLowerCase() === myEmail);
         const myFileId = myStaffInfo ? (myStaffInfo.file_ca_nhan_id || '').trim() : '';
         
         let htmlRows = '';
         let passedRow = {};
         if (!myFileId) {
            htmlRows = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--clr-text-muted);">Không tìm thấy cấu hình file cá nhân cho email ${this._escHtml(myEmail)}</td></tr>`;
         } else {
            const records = await this._readSheet(this.session.accessToken, 'LUONG', '', myFileId).catch(() => []);
            const myRow = records.find(r => {
               const raw = (r.thang || '').trim();
               return App._serialToMonthYear(raw) === targetMonthYear || raw === targetMonthYear;
            });
            if (myRow) passedRow = myRow;
            
            if (!myRow) {
               htmlRows = `<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--clr-text-muted);">Lương tháng ${targetMonthYear} chưa được chốt.</td></tr>`;
            } else {
               const luongCoBan = parseFloat(myRow.luong_co_ban) || 0;
               const support = parseFloat(myRow.support) || 0;
               const thuongSale = parseFloat(myRow.thuong) || 0;
               const luongHieuSuat = parseFloat(myRow.luong_hieu_suat) || 0;
               const thuongRieng = parseFloat(myRow.thuong_rieng) || 0;
               const tongLuong = parseFloat(myRow.tong_luong) || 0;
               
               let rowBgColor = '#FBF9F6';
               let hoverBg = '#f9f9f9';
               const rawLoai = (myRow.loai_luong || '').trim().toLowerCase();
               if (rawLoai === 'sale') { rowBgColor = '#F3EFFB'; hoverBg = '#EBE2F8'; }
               else if (rawLoai === 'designer_hieu_suat') { rowBgColor = '#E8F5E9'; hoverBg = '#DCEDDF'; }

               let phuCapHtml = '';
               if (support > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Support:</span> <span style="color:#6B5B95; font-weight:700; font-size:14px;">+${this._formatVND(support)}</span></div>`;
               if (thuongSale > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Thưởng sale:</span> <span style="color:#6B5B95; font-weight:700; font-size:14px;">+${this._formatVND(thuongSale)}</span></div>`;
               if (luongHieuSuat > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Lương hiệu suất:</span> <span style="color:#4A7C59; font-weight:700; font-size:14px;">+${this._formatVND(luongHieuSuat)}</span></div>`;
               if (thuongRieng > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Thưởng riêng:</span> <span style="color:#8B5FBF; font-weight:700; font-size:14px;">+${this._formatVND(thuongRieng)}</span></div>`;
               
               if (!phuCapHtml) phuCapHtml = '<div style="color:#6B6B6B; font-size:14px;">-</div>';

               htmlRows += `
                 <tr style="background:${rowBgColor}; border-bottom:1px solid var(--clr-border); transition: background 0.2s;" onmouseover="this.style.background='${hoverBg}'" onmouseout="this.style.background='${rowBgColor}'">
                   <td style="padding:16px;">
                     <div style="font-weight:700; font-size:16px; color:#2A2420;">${this._escHtml(this.session.hoTen || myEmail)}</div>
                     <div style="font-size:13px; color:#6B6B6B; margin-bottom:4px;">${this._escHtml(myEmail)}</div>
                     <div style="font-size:12px; display:inline-block; padding:2px 8px; background:var(--clr-bg); border-radius:4px; color:var(--clr-accent); text-transform:uppercase;">${this._escHtml(this.session.role)}</div>
                   </td>
                   <td style="padding:16px; text-align:right; font-weight:700; font-size:16px; color:#2A2420; white-space:nowrap;">${this._formatVND(luongCoBan)}</td>
                   <td style="padding:16px; text-align:right;">${phuCapHtml}</td>
                   <td style="padding:16px; text-align:right; white-space:nowrap;"><span style="background:#F5EFE6; color:#2A2420; font-weight:800; font-size:18px; padding:6px 12px; border-radius:8px; display:inline-block;">${this._formatVND(tongLuong)}</span></td>
                 </tr>
               `;
               
               const giaiThich = myRow.giai_thich || '';
               if (giaiThich) {
                  htmlRows += `
                    <tr style="background:${rowBgColor}; box-shadow:var(--shadow-sm); border-radius:16px; transform: translateY(-12px);">
                      <td colspan="4" style="padding:12px 16px; border-radius:0 0 16px 16px; font-size:14px; color:#6B6B6B; line-height:1.6;">
                        ${giaiThich}
                      </td>
                    </tr>
                  `;
               }
            }
         }
         tbody.innerHTML = htmlRows;
         tableCont.style.display = 'block';
         loading.style.display = 'none';
         
         this._renderProgressNonAdmin(targetMonthYear, yearStr, passedRow).catch(err => {
            console.error('[Progress] Lỗi tải tiến độ cá nhân:', err);
            const prog = document.getElementById('bl-progress-container');
            if (prog) {
               prog.innerHTML = '<div style="color:var(--clr-text-muted); font-size:13px; padding:12px; background:var(--clr-bg); border-radius:8px;">Chưa thể tải tiến độ (bạn có thể thiếu quyền đọc file).</div>';
               prog.style.display = 'block';
            }
         });
         
         return;
      }
      
      // 1. Tải CAU_HINH_LUONG và THUONG_RIENG
      let cauHinhList = [];
      let thuongRiengList = [];
      try {
        const [chData, trData] = await Promise.all([
          this._readSheet(this.session.accessToken, CONFIG.SHEETS.CAU_HINH_LUONG),
          this._readSheet(this.session.accessToken, CONFIG.SHEETS.THUONG_RIENG)
        ]);
        cauHinhList = chData;
        thuongRiengList = trData;
        this._currentCauHinhList = cauHinhList;
      } catch (err) {
        if (err.message.includes('403')) {
          throw new Error('Bạn không có quyền truy cập file Lương. Vui lòng yêu cầu cấp quyền đọc file Lương (ID: ' + CONFIG.PAYROLL_SPREADSHEET_ID + ').');
        }
        throw err;
      }

      // 2. Tải DON_HANG, DIEM_DESIGNER, TIEN_DON (hoặc dùng cache nếu có)
      const [donHangListRaw, diemList, tienDonRows] = await Promise.all([
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER),
        this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(()=>[])
      ]);
      const donHangList = (donHangListRaw || []).filter(d => d.da_an !== 'yes');

      const tienDonMap = {};
      tienDonRows.forEach(r => { if(r.ma_don) tienDonMap[r.ma_don] = r.tong_gia_tri; });
      donHangList.forEach(d => { if (tienDonMap[d.ma_don] !== undefined) d.tong_gia_tri = tienDonMap[d.ma_don]; });

      // Lọc các đơn hàng hợp lệ: không hủy, đã thu đủ (ngay_thu_du thuộc tháng đang xét)
      const validOrdersInMonth = donHangList.filter(d => {
        const tt = (d.trang_thai || '').toLowerCase();
        if (tt.includes('hủy') || tt.includes('huy')) return false;
        
        const ngayThuDu = (d.ngay_thu_du || '').trim();
        if (!ngayThuDu) return false;
        
        // ngay_thu_du format: dd/MM/yyyy -> extract MM/yyyy
        const parts = ngayThuDu.split('/');
        if (parts.length >= 2) {
           const mm = parts[1];
           const yyyy = parts.length === 3 ? parts[2] : yearStr; 
           const mY = `${mm}/${yyyy}`;
           return mY === targetMonthYear;
        }
        return false;
      });

      // Tổng doanh thu support (của tất cả đơn hoàn thành trong tháng)
      const totalSupportRevenue = validOrdersInMonth.reduce((sum, d) => sum + this._tinhSoPhaiThu(d), 0);

      // Điểm designer map
      // Cần map từ ma_don -> ngay_duyet_mau -> kiểm tra tháng
      const donHangMap = {};
      donHangList.forEach(d => donHangMap[d.ma_don] = d);
      
      const validDiemInMonth = diemList.filter(diem => {
         const don = donHangMap[diem.ma_don];
         if (!don) return false;
         const ngayDuyet = (don.ngay_duyet_mau || '').trim();
         if (!ngayDuyet) return false;
         
         const parts = ngayDuyet.split('/');
         if (parts.length >= 2) {
            const mm = parts[1];
            const yyyy = parts.length === 3 ? parts[2] : yearStr;
            const mY = `${mm}/${yyyy}`;
            return mY === targetMonthYear;
         }
         return false;
      });

      let htmlRows = '';
      let tongChiLuongThang = 0;
      let progressHtml = `<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px;">`;
      
      this._lastCalculatedSalaryData = [];
      this._currentTargetMonthYear = targetMonthYear;

      // 3. Tính toán cho từng người
      for (const nhanVien of cauHinhList) {
        if (!nhanVien.email || !nhanVien.ho_ten) continue;

        const email = nhanVien.email.trim().toLowerCase();
        const hoTen = nhanVien.ho_ten.trim();
        const loaiLuong = (nhanVien.loai_luong || '').trim().toLowerCase();
        const vaiTro = nhanVien.vai_tro || '';
        const luongCoBan = this._parseCurrency(nhanVien.luong_co_ban);

        // Tính thưởng riêng
        const thuongRieng = thuongRiengList
          .filter(tr => (tr.email||'').trim().toLowerCase() === email && (tr.thang||'').trim() === targetMonthYear)
          .reduce((sum, tr) => sum + this._parseCurrency(tr.so_tien), 0);

        let support = 0;
        let thuongSale = 0;
        let luongHieuSuat = 0;
        let tongLuong = 0;
        let totalThuongRevenue = 0;
        let diemOfDesigner = 0;

        if (loaiLuong === 'admin') {
          // Admin không tính lương
          htmlRows += `
            <tr style="background:#FFFFFF; box-shadow:var(--shadow-sm); border-radius:16px; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.01)'" onmouseout="this.style.transform='scale(1)'">
              <td style="padding:16px; border-radius: 16px 0 0 16px;">
                <div style="font-weight:600; font-size:15px; color:var(--clr-text);">${this._escHtml(hoTen)}</div>
                <div style="font-size:12px; color:var(--clr-text-muted); margin-bottom:4px;">${this._escHtml(email)}</div>
                <div style="font-size:11px; display:inline-block; padding:2px 8px; background:var(--clr-bg); border-radius:4px; color:var(--clr-accent);">${this._escHtml(vaiTro)} &bull; ${this._escHtml(loaiLuong)}</div>
              </td>
              <td style="padding:16px; text-align:right; color:var(--clr-text-muted);">-</td>
              <td style="padding:16px; text-align:right; color:var(--clr-text-muted);">-</td>
              <td style="padding:16px; text-align:right; font-weight:bold; color:var(--clr-text-muted); font-size:16px; border-radius: 0 16px 16px 0;">-</td>
            </tr>
          `;
          continue;
        }

        if (loaiLuong === 'sale') {
           const ptSupport = parseFloat(nhanVien.phan_tram_support) || 0;
           support = totalSupportRevenue * (ptSupport / 100);

           const ptThuong = parseFloat(nhanVien.phan_tram_thuong) || 0;
           const kpiDoanhSo = this._parseCurrency(nhanVien.kpi_doanh_so);

           const saleOrders = validOrdersInMonth.filter(d => (d.sale_phu_trach || '').trim().toLowerCase() === hoTen.toLowerCase());
           totalThuongRevenue = saleOrders.reduce((sum, d) => sum + this._tinhSoPhaiThu(d), 0);

           let ptDat = 0;
           if (kpiDoanhSo > 0) {
              ptDat = totalThuongRevenue / kpiDoanhSo;
           }

           if (ptDat >= 0.8) {
              thuongSale = totalThuongRevenue * ptDat * (ptThuong / 100);
           } else {
              thuongSale = 0;
           }

           tongLuong = luongCoBan + support + thuongSale + thuongRieng;
           
           progressHtml += `<div style="background:linear-gradient(135deg, #EDE7F6, #F3EFFB); padding:16px; border-radius:20px; box-shadow:var(--shadow-sm); border:1px solid rgba(255,255,255,0.5);">
              <div style="font-weight:700; font-size:14px; color:#2A2420; margin-bottom:12px; display:flex; align-items:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; color:#6B5B95;"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                ${this._escHtml(hoTen)} (Sale)
              </div>
              ${this._buildProgressBarHtml('Doanh số tháng này', totalThuongRevenue, kpiDoanhSo, true, thuongSale, true)}
           </div>`;
        } 
        else if (loaiLuong === 'designer_hieu_suat') {
           diemOfDesigner = validDiemInMonth
              .filter(d => (d.ten_designer || '').trim().toLowerCase() === hoTen.toLowerCase())
              .reduce((sum, d) => sum + parseFloat(d.diem || 0), 0);

           const kpiDiem = parseFloat(nhanVien.kpi_diem) || 0;
           const donGiaDiem = this._parseCurrency(nhanVien.don_gia_diem);

           let ptHieuSuat = 0;
           if (kpiDiem > 0) {
              ptHieuSuat = diemOfDesigner / kpiDiem;
           }

           if (ptHieuSuat >= 0.8) {
              luongHieuSuat = 0.04 * donGiaDiem * ptHieuSuat * diemOfDesigner;
           } else {
              luongHieuSuat = 0;
           }

           tongLuong = luongCoBan + luongHieuSuat + thuongRieng;
           
           progressHtml += `<div style="background:linear-gradient(135deg, #E8F5E9, #F1F9F2); padding:16px; border-radius:20px; box-shadow:var(--shadow-sm); border:1px solid rgba(160,214,188,0.3);">
              <div style="font-weight:700; font-size:14px; color:#2E7D32; margin-bottom:12px; display:flex; align-items:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:8px; color:#9C7E5E;"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                ${this._escHtml(hoTen)} (Designer)
              </div>
              ${this._buildProgressBarHtml('Điểm tháng này', diemOfDesigner, kpiDiem, false, luongHieuSuat)}
           </div>`;
        }
        else if (loaiLuong === 'designer_co_ban') {
           tongLuong = luongCoBan + thuongRieng;
        }

        // Background logic
        let rowBgColor = '#FBF9F6';
        let hoverBg = '#f9f9f9';
        if (loaiLuong === 'sale') { rowBgColor = '#F3EFFB'; hoverBg = '#EBE2F8'; }
        else if (loaiLuong === 'designer_hieu_suat') { rowBgColor = '#E8F5E9'; hoverBg = '#DCEDDF'; }

        // Xử lý html phụ cấp
        let phuCapHtml = '';
        if (support > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Support:</span> <span style="color:#8D6E63; font-weight:700; font-size:14px;">+${this._formatVND(support)}</span></div>`;
        if (thuongSale > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Thưởng sale:</span> <span style="color:#8D6E63; font-weight:700; font-size:14px;">+${this._formatVND(thuongSale)}</span></div>`;
        if (luongHieuSuat > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Lương hiệu suất:</span> <span style="color:#2E7D32; font-weight:700; font-size:14px;">+${this._formatVND(luongHieuSuat)}</span></div>`;
        if (thuongRieng > 0) phuCapHtml += `<div style="display:flex; justify-content:flex-end; gap:12px; margin-bottom:4px;"><span style="color:#6B6B6B; font-size:13px;">Thưởng riêng:</span> <span style="color:#7B1FA2; font-weight:700; font-size:14px;">+${this._formatVND(thuongRieng)}</span></div>`;
        
        if (!phuCapHtml) phuCapHtml = '<div style="color:#6B6B6B; font-size:14px;">-</div>';

        tongChiLuongThang += tongLuong;

        let explHtml = '';
        if (loaiLuong === 'sale') {
           const ptSupport = parseFloat(nhanVien.phan_tram_support) || 0;
           const ptThuong = parseFloat(nhanVien.phan_tram_thuong) || 0;
           const kpiDoanhSo = this._parseCurrency(nhanVien.kpi_doanh_so);
           let ptDat = 0;
           if (kpiDoanhSo > 0) ptDat = totalThuongRevenue / kpiDoanhSo;

           explHtml += `<div><b>Support:</b> ${ptSupport}% &times; Tổng doanh thu công ty đã thu đủ trong tháng = ${ptSupport}% &times; ${this._formatVND(totalSupportRevenue)} = ${this._formatVND(support)}</div>`;
           explHtml += `<div style="margin-top:6px;"><b>Thưởng KPI:</b> Doanh số bạn chốt (đã thu đủ): ${this._formatVND(totalThuongRevenue)}<br>`;
           explHtml += `KPI: ${this._formatVND(kpiDoanhSo)} &rarr; Đạt: ${(ptDat * 100).toFixed(1)}%<br>`;
           explHtml += `Nếu đạt &ge; 80%: Thưởng = Doanh số &times; %đạt &times; ${ptThuong}% = ${this._formatVND(thuongSale)}<br>`;
           explHtml += `<i>(Hiện tại đạt ${(ptDat * 100).toFixed(1)}% &rarr; ${ptDat >= 0.8 ? 'Đủ điều kiện nhận thưởng' : '<span style="color:var(--clr-danger, #e74c3c)">Chưa đủ điều kiện nhận thưởng</span>'})</i></div>`;
        } else if (loaiLuong === 'designer_hieu_suat') {
           const kpiDiem = parseFloat(nhanVien.kpi_diem) || 0;
           const donGiaDiem = this._parseCurrency(nhanVien.don_gia_diem);
           let ptHieuSuat = 0;
           if (kpiDiem > 0) ptHieuSuat = diemOfDesigner / kpiDiem;

           explHtml += `<div><b>Lương hiệu suất:</b> Điểm đạt trong tháng: ${diemOfDesigner}<br>`;
           explHtml += `KPI điểm: ${kpiDiem} &rarr; Hiệu suất: ${(ptHieuSuat * 100).toFixed(1)}%<br>`;
           explHtml += `Nếu hiệu suất &ge; 80%: Lương hiệu suất = 4% &times; ${this._formatVND(donGiaDiem)} &times; ${(ptHieuSuat * 100).toFixed(1)}% &times; ${diemOfDesigner} = ${this._formatVND(luongHieuSuat)}<br>`;
           explHtml += `<i>(Hiện tại đạt ${(ptHieuSuat * 100).toFixed(1)}% &rarr; ${ptHieuSuat >= 0.8 ? 'Đủ điều kiện nhận lương hiệu suất' : '<span style="color:var(--clr-danger, #e74c3c)">Chưa đủ điều kiện</span>'})</i></div>`;
        }

        if (thuongRieng > 0) {
           const notes = thuongRiengList
              .filter(tr => (tr.email||'').trim().toLowerCase() === email && (tr.thang||'').trim() === targetMonthYear)
              .map(tr => (tr.ghi_chu||'').trim())
              .filter(Boolean)
              .join(', ');
           explHtml += `<div style="margin-top:6px;"><b>Thưởng riêng tháng này:</b> ${this._formatVND(thuongRieng)} ${notes ? `(${this._escHtml(notes)})` : ''}</div>`;
        }

        if (nhanVien.file_ca_nhan_id) {
           this._lastCalculatedSalaryData.push({
             ho_ten: hoTen,
             file_id: nhanVien.file_ca_nhan_id,
             thang: targetMonthYear,
             luong_co_ban: Math.round(luongCoBan) || 0,
             support: Math.round(support) || 0,
             thuong: Math.round(thuongSale) || 0,
             luong_hieu_suat: Math.round(luongHieuSuat) || 0,
             thuong_rieng: Math.round(thuongRieng) || 0,
             tong_luong: Math.round(tongLuong) || 0,
             giai_thich: explHtml
           });
        }

        // (Progress bars are now built inside the loaiLuong switch above)

        // Render dòng cho nhân viên này
        htmlRows += `
          <tr style="background:${rowBgColor}; box-shadow:var(--shadow-sm); border-radius:16px; transition: transform 0.2s, background 0.2s;" onmouseover="this.style.transform='scale(1.01)'; this.style.background='${hoverBg}'" onmouseout="this.style.transform='scale(1)'; this.style.background='${rowBgColor}'">
            <td style="padding:16px; border-radius: ${explHtml ? '16px 0 0 0' : '16px 0 0 16px'};">
              <div style="font-weight:700; font-size:16px; color:#2A2420;">${this._escHtml(hoTen)}</div>
              <div style="font-size:13px; color:#6B6B6B; margin-bottom:4px;">${this._escHtml(email)}</div>
              <div style="font-size:12px; display:inline-block; padding:2px 8px; background:var(--clr-bg); border-radius:4px; color:var(--clr-accent); text-transform:uppercase;">${this._escHtml(vaiTro)} &bull; ${this._escHtml(loaiLuong)}</div>
            </td>
            <td style="padding:16px; text-align:right; font-weight:700; font-size:16px; color:#2A2420; white-space:nowrap;">${this._formatVND(luongCoBan)}</td>
            <td style="padding:16px; text-align:right;">${phuCapHtml}</td>
            <td style="padding:16px; text-align:right; white-space:nowrap; border-radius: ${explHtml ? '0 16px 0 0' : '0 16px 16px 0'};"><span style="background:#F5EFE6; color:#2A2420; font-weight:800; font-size:18px; padding:6px 12px; border-radius:8px; display:inline-block;">${this._formatVND(tongLuong)}</span></td>
          </tr>
        `;
        
        if (explHtml) {
           htmlRows += `
             <tr style="background:${rowBgColor}; box-shadow:var(--shadow-sm); border-radius:16px; transform: translateY(-12px);">
               <td colspan="4" style="padding:12px 16px; border-radius:0 0 16px 16px; font-size:14px; color:#6B6B6B; line-height:1.6;">
                 ${explHtml}
               </td>
             </tr>
           `;
        }
      }

      progressHtml += `</div>`;
      const progCont = document.getElementById('bl-progress-container');
      if (progCont) {
         progCont.innerHTML = progressHtml;
         progCont.style.display = 'block';
      }

      if (!htmlRows) {
        htmlRows = '<tr><td colspan="4" style="text-align:center; padding:24px; color:var(--clr-text-muted); background:#FFFFFF; border-radius:16px;">Không có dữ liệu nhân sự trong CẤU HÌNH LƯƠNG</td></tr>';
      } else if (this.session?.role === 'admin') {
        htmlRows += `
          <tr style="background:#FFFFFF; box-shadow:var(--shadow-sm); border-radius:16px;">
            <td colspan="3" style="padding:20px 16px; text-align:right; font-weight:bold; font-size:16px; color:var(--clr-text); border-radius:16px 0 0 16px;">TỔNG CHI LƯƠNG THÁNG:</td>
            <td style="padding:20px 16px; text-align:right; font-weight:bold; font-size:18px; color:var(--clr-accent); border-radius:0 16px 16px 0;">${this._formatVND(tongChiLuongThang)}</td>
          </tr>
        `;
      }

      tbody.innerHTML = htmlRows;
      tableCont.style.display = 'block';

    } catch (err) {
      console.error('[Payroll] Lỗi tính lương:', err);
      errorCont.innerHTML = `<strong>Lỗi:</strong> ${err.message}`;
      errorCont.style.display = 'block';
    } finally {
      loading.style.display = 'none';
    }
  },

  showAddThuongRiengForm() {
    if (!this._currentCauHinhList || this._currentCauHinhList.length === 0) {
      alert('Vui lòng ấn "Xem" bảng lương trước để tải danh sách nhân viên.');
      return;
    }

    const modalId = 'modal-add-thuong-rieng';
    if (document.getElementById(modalId)) return;

    const picker = document.getElementById('bl-month-picker');
    let defaultMonthVal = '';
    if (picker && picker.value) {
      defaultMonthVal = picker.value;
    }

    const optionsHtml = this._currentCauHinhList.filter(nv => {
      const email = (nv.email || '').trim();
      const hoTen = (nv.ho_ten || '').trim();
      if (!email.includes('@') || !hoTen) return false;
      const lowerEmail = email.toLowerCase();
      const lowerName = hoTen.toLowerCase();
      if (lowerEmail.includes('hướng dẫn') || lowerName.includes('hướng dẫn') || 
          lowerEmail.includes('->') || lowerName.includes('->') || 
          lowerEmail.includes('=') || lowerName.includes('=')) return false;
      return true;
    }).map(nv => {
      const email = (nv.email || '').trim();
      const hoTen = (nv.ho_ten || '').trim();
      return `<option value="${this._escHtml(email)}">${this._escHtml(hoTen)} (${this._escHtml(email)})</option>`;
    }).join('');

    const html = `
      <div id="${modalId}" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(42,36,32,0.4); z-index:9999; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
        <div style="background:#FFFFFF; width:440px; max-width:90%; border-radius:24px; box-shadow:var(--shadow-lg); overflow:hidden; animation:slideIn 0.3s ease;">
          <div style="padding:20px 24px; border-bottom:1px solid #EFEBE4; display:flex; justify-content:space-between; align-items:center; background:#FBF9F6;">
            <div style="font-weight:700; color:#9C7E5E; font-size:18px;">Thêm thưởng riêng</div>
            <button onclick="document.getElementById('${modalId}').remove()" style="background:transparent; border:none; cursor:pointer; font-size:24px; color:#9C7E5E; line-height:1;">&times;</button>
          </div>
          <div style="padding:24px;">
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label" style="color:#2A2420; font-size:14px; font-weight:600; margin-bottom:8px; display:block;">Nhân viên *</label>
              <select id="tr-email" class="form-input" style="width:100%; padding:10px 16px; border-radius:12px; border:1px solid #EFEBE4; outline:none; background:#FBF9F6; color:#2A2420; font-size:14px;">
                <option value="">-- Chọn nhân viên --</option>
                ${optionsHtml}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label" style="color:#2A2420; font-size:14px; font-weight:600; margin-bottom:8px; display:block;">Tháng *</label>
              <input type="month" id="tr-thang" class="form-input" value="${defaultMonthVal}" style="width:100%; padding:10px 16px; border-radius:12px; border:1px solid #EFEBE4; outline:none; background:#FBF9F6; color:#2A2420; font-size:14px;" />
            </div>
            <div class="form-group" style="margin-bottom:20px;">
              <label class="form-label" style="color:#2A2420; font-size:14px; font-weight:600; margin-bottom:8px; display:block;">Số tiền (VNĐ) *</label>
              <input type="text" id="tr-sotien" class="form-input" placeholder="Ví dụ: 500.000" style="width:100%; padding:10px 16px; border-radius:12px; border:1px solid #EFEBE4; outline:none; background:#FBF9F6; color:#2A2420; font-size:16px; font-weight:700;" oninput="let v = this.value.replace(/[^0-9]/g, ''); this.value = v ? parseInt(v, 10).toLocaleString('vi-VN') : '';" />
            </div>
            <div class="form-group" style="margin-bottom:28px;">
              <label class="form-label" style="color:#2A2420; font-size:14px; font-weight:600; margin-bottom:8px; display:block;">Ghi chú</label>
              <input type="text" id="tr-ghichu" class="form-input" placeholder="Ví dụ: Thưởng dự án ABC..." style="width:100%; padding:10px 16px; border-radius:12px; border:1px solid #EFEBE4; outline:none; background:#FBF9F6; color:#2A2420; font-size:14px;" />
            </div>
            <div style="display:flex; justify-content:flex-end; gap:12px;">
              <button class="btn btn-ghost" onclick="document.getElementById('${modalId}').remove()" style="padding:10px 20px; border-radius:16px; font-weight:600;">Hủy</button>
              <button id="btn-save-tr" class="btn btn-primary" onclick="App.saveThuongRieng('${modalId}')" style="padding:10px 20px; border-radius:16px; font-weight:600; background:var(--clr-accent-gradient); color:#fff; border:none; box-shadow:0 2px 6px rgba(156,126,94,0.3);">Lưu thưởng riêng</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
  },

  async saveThuongRieng(modalId) {
    const email = document.getElementById('tr-email').value.trim();
    let thangRaw = document.getElementById('tr-thang').value.trim();
    let soTienStr = document.getElementById('tr-sotien').value.replace(/[^0-9]/g, '');
    const ghiChu = document.getElementById('tr-ghichu').value.trim();
    const soTien = parseFloat(soTienStr);

    if (!email) { alert('Vui lòng chọn nhân viên.'); return; }
    
    let thang = '';
    if (thangRaw) {
      const parts = thangRaw.split('-');
      if (parts.length === 2) {
        thang = `${parts[1]}/${parts[0]}`;
      }
    }
    
    if (!thang || !/^\d{2}\/\d{4}$/.test(thang)) { alert('Tháng không hợp lệ.'); return; }
    if (!soTienStr || isNaN(soTien) || soTien <= 0) { alert('Số tiền phải là số lớn hơn 0.'); return; }

    const btn = document.getElementById('btn-save-tr');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = 'Đang lưu...';
    }

    try {
      await this._appendSheet(CONFIG.SHEETS.THUONG_RIENG, [[email, thang, soTien, ghiChu]]);
      alert('Đã lưu thưởng riêng thành công!');
      document.getElementById(modalId).remove();
      await this.loadBangLuong();
    } catch (err) {
      console.error(err);
      alert('Lỗi khi lưu thưởng riêng: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = 'Lưu thưởng riêng';
      }
    }
  },

  async chotLuong() {
    if (!this._lastCalculatedSalaryData || this._lastCalculatedSalaryData.length === 0) {
      alert('Không có dữ liệu lương để chốt. Vui lòng ấn Xem trước (và đảm bảo có cấu hình file cá nhân).');
      return;
    }
    const targetMonth = this._currentTargetMonthYear;
    
    if (!confirm(`Chốt lương tháng ${targetMonth}? Dữ liệu sẽ ghi vào file cá nhân của nhân viên.`)) {
      return;
    }

    const btn = document.getElementById('btn-chot-luong');
    if (btn) {
      btn.dataset.oldText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px; margin-right:6px; display:inline-block; vertical-align:middle; border-color:white transparent transparent transparent;"></span> Đang chốt...';
      btn.disabled = true;
      btn.style.opacity = '0.7';
    }

    let successCount = 0;
    let errors = [];

    for (const data of this._lastCalculatedSalaryData) {
      try {
        const records = await this._readSheet(this.session.accessToken, 'LUONG', '', data.file_id);
        const existingIdx = records.findIndex(r => this._serialToMonthYear(r.thang) === targetMonth);

        const finalThang = `'${targetMonth}`;
        console.log(`[DEBUG chot luong] ghi thang = ${finalThang} cho email/ho_ten ${data.ho_ten}`);
        
        const rowDataArray = [[
          finalThang,
          data.luong_co_ban || 0,
          data.support || 0,
          data.thuong || 0,
          data.luong_hieu_suat || 0,
          data.thuong_rieng || 0,
          data.tong_luong || 0,
          data.giai_thich || ''
        ]];

        if (existingIdx >= 0) {
          const rowNum = existingIdx + 2;
          await this._writeSheet('LUONG', `A${rowNum}:H${rowNum}`, rowDataArray, data.file_id);
        } else {
          await this._appendSheet('LUONG', rowDataArray, data.file_id);
        }
        successCount++;
      } catch (err) {
        console.error(`Lỗi chốt lương cho ${data.ho_ten}:`, err);
        errors.push(`${data.ho_ten} (${err.message})`);
      }
    }

    if (btn) {
      btn.innerHTML = btn.dataset.oldText;
      btn.disabled = false;
      btn.style.opacity = '1';
    }

    if (errors.length > 0) {
      alert(`Đã chốt lương tháng ${targetMonth} cho ${successCount} nhân viên.\nTuy nhiên có lỗi với các nhân viên sau:\n- ` + errors.join('\n- '));
    } else {
      alert(`Thành công! Đã chốt lương tháng ${targetMonth} cho ${successCount} nhân viên.`);
    }
  },

  // ════════════════════════════════════════════════════════════
  //  KANBAN PAGE
  // ════════════════════════════════════════════════════════════

  KANBAN_COLS: [
    'Đơn mới',
    'Đang thiết kế',
    'Pending',
    'Chờ leader duyệt',
    'Gửi khách hàng',
    'Đơn cần chỉnh sửa',
    'Chờ khách hàng phản hồi',
    'Cần xuất hoàn thành',
    'Bàn giao khách hàng',
    'Hoàn thành đơn',
  ],

  LABEL_PRESETS: [
    { nhan: 'Ưu tiên',     mau: '#E67E22' },
    { nhan: 'Gấp',         mau: '#E74C3C' },
    { nhan: 'Đã thanh toán', mau: '#8E44AD' },
    { nhan: 'Chỉnh sửa nhỏ', mau: '#1E8449' },
    { nhan: 'Đúng deadline', mau: '#27AE60' },
    { nhan: 'Lưu trữ',      mau: '#7F8C8D' },
  ],

  async renderKanbanPage() {
    const content = document.getElementById('page-content');
    content.style.padding = '24px';
    content.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;padding:80px 0;flex-direction:column;gap:16px;">
      <div class="spinner" style="width:32px;height:32px;border-width:3px;border-color:rgba(138,114,76,0.2);border-top-color:var(--clr-accent);"></div>
      <p style="font-size:var(--font-size-sm);color:var(--clr-text-muted);">Đang tải bảng Kanban...</p>
    </div>`;

    // Load DON_HANG + DIEM_DESIGNER + NHAN_DON + KHACH_HANG + DIEM_XU_LY concurrently
    let donHangList = [], diemDesignerList = [], nhanDonList = [], khachHangList = [], tienDonList = [], diemXuLyList = [];
    await Promise.allSettled([
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG)
        .then(r => { donHangList = (r || []).filter(d => d.da_an !== 'yes'); })
        .catch(e => console.warn('[Kanban] DON_HANG:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER)
        .then(r => { diemDesignerList = r || []; })
        .catch(e => console.warn('[Kanban] DIEM_DESIGNER:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.NHAN_DON)
        .then(r => { nhanDonList = r || []; })
        .catch(e => console.warn('[Kanban] NHAN_DON:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.KHACH_HANG, 'A:I')
        .then(r => { khachHangList = r || []; })
        .catch(e => console.warn('[Kanban] KHACH_HANG:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.NHAN_SU)
        .then(r => { this._nhanSuList = r || []; })
        .catch(e => console.warn('[Kanban] NHAN_SU:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.COMMENT)
        .then(r => { this._commentList = r || []; })
        .catch(e => console.warn('[Kanban] COMMENT:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.GIAO_DICH_TIEN)
        .then(r => { this._giaoDichTienList = r || []; })
        .catch(e => console.warn('[Kanban] GIAO_DICH_TIEN:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B')
        .then(r => { tienDonList = r || []; })
        .catch(e => console.warn('[Kanban] TIEN_DON:', e.message)),
      this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY)
        .then(r => { diemXuLyList = r || []; })
        .catch(e => console.warn('[Kanban] DIEM_XU_LY:', e.message)),
    ]);

    const tienDonMap = {};
    tienDonList.forEach(row => { if (row.ma_don) tienDonMap[row.ma_don] = row.tong_gia_tri; });
    donHangList.forEach(d => { if (tienDonMap[d.ma_don] !== undefined) d.tong_gia_tri = tienDonMap[d.ma_don]; });

    // Cache the mapping globally in case other methods need it (like _openCardDetail which relies on donHangList)
    this._donHangList = donHangList;

    // Build diem xu ly map: ma_don -> ten_designer -> diem_tam
    const diemXuLyMap = {};
    diemXuLyList.forEach(d => {
      const ma = d.ma_don || '';
      if (!ma) return;
      if (!diemXuLyMap[ma]) diemXuLyMap[ma] = {};
      let ten = d.ten_designer || d.designer || d.ho_ten || d.ten || '';
      if (ten.includes('@') && this._nhanSuList) {
         const ns = this._nhanSuList.find(n => n.email === ten);
         if (ns) {
            ten = ns.ten || ns.ho_ten || ns.ten_nhan_vien || ten;
         }
      }
      if (ten) {
        diemXuLyMap[ma][ten] = d.diem_tam || '';
      }
    });
    this._kanbanDiemXuLyMap = diemXuLyMap;


    // Build designer lookup: ma_don → [ten_designer, ...]
    const designerMap = {};
    const designerScoreMap = {};
    const hasDesignerPhuTrach = new Set(); // Đánh dấu đơn có dữ liệu ở cột designer_phu_trach

    // 1. Ưu tiên đọc từ cột designer_phu_trach của DON_HANG
    donHangList.forEach(don => {
      const ma = don.ma_don || '';
      if (!ma) return;
      if (!designerMap[ma]) designerMap[ma] = [];
      if (!designerScoreMap[ma]) designerScoreMap[ma] = {};

      const dpt = (don.designer_phu_trach || '').trim();
      if (dpt) {
        hasDesignerPhuTrach.add(ma);
        const names = dpt.split(',').map(n => n.trim()).filter(Boolean);
        console.log(`[DEBUG designer] đọc designer_phu_trach đơn ${ma} = [${names.join(', ')}]`);
        names.forEach(ten => {
          if (!designerMap[ma].includes(ten)) {
            designerMap[ma].push(ten);
          }
        });
      }
    });

    // 2. Lấy điểm và Fallback danh sách designer từ DIEM_DESIGNER
    diemDesignerList.forEach(d => {
      const ma = d.ma_don || '';
      if (!ma) return;
      if (!designerMap[ma]) designerMap[ma] = [];
      if (!designerScoreMap[ma]) designerScoreMap[ma] = {};
      let ten = d.ten_designer || d.designer || d.ho_ten || d.ten || '';
      
      if (ten.includes('@') && this._nhanSuList) {
         const ns = this._nhanSuList.find(n => n.email === ten);
         if (ns) {
            ten = ns.ten || ns.ho_ten || ns.ten_nhan_vien || ten;
         }
      }
      
      if (ten) {
        // Nếu đơn NÀY không có designer_phu_trach (fallback), thì mới add tên vào list
        if (!hasDesignerPhuTrach.has(ma) && !designerMap[ma].includes(ten)) {
          designerMap[ma].push(ten);
        }
        // Vẫn luôn ghi nhận điểm từ DIEM_DESIGNER
        designerScoreMap[ma][ten] = d.diem || '';
      }
    });
    this._kanbanDesignerScoreMap = designerScoreMap;

    // Build label lookup: ma_don → [{nhan, mau}, ...]
    const labelMap = {};
    nhanDonList.forEach(r => {
      const ma = r.ma_don || '';
      if (!ma) return;
      if (!labelMap[ma]) labelMap[ma] = [];
      labelMap[ma].push({ nhan: r.nhan || '', mau: r.mau || '#999' });
    });

    // Build khach hang lookup: ma_kh → { fanpage, zalo, sdt, brand, nganh }
    const khachHangMap = {};
    khachHangList.forEach(k => {
      const ma = k.ma_kh;
      if (ma) khachHangMap[ma] = k;
    });

    this._kanbanData        = donHangList;
    this._kanbanDesignerMap = designerMap;
    this._kanbanLabelMap    = labelMap;
    this._kanbanKhachHangMap= khachHangMap;
    this._kanbanNhanDonRaw  = nhanDonList;

    // Cache row index
    this._kanbanRowMap = {};
    donHangList.forEach((d, idx) => { this._kanbanRowMap[d.ma_don] = idx + 2; });

    this._renderKanbanBoard();
    this._batDauTuDongCapNhatKanban();
  },

  // ──────────────────────────────────────────────────────────
  // BAO CO THAY DOI MOI TREN BANG KANBAN
  //  - Cu 10 giay kiem 1 lan, chi doc 1 bang DON_HANG cho nhe
  //  - Phat hien thay doi thi HIEN THONG BAO, khong tu ve lai
  //  - Tab bi an  -> ngung hoi
  //  - 15 phut khong ai dung -> NGU, cham vao la tinh day va kiem ngay
  //  - Gap loi (vd 429 qua tai) -> gian nhip 10s > 20s > 40s > 80s roi tu ve lai
  // ──────────────────────────────────────────────────────────
  _kanbanAutoTimer: null,
  _kanbanVanTay: '',
  _kanbanVanTayBoQua: '',
  _kanbanVanTayCho: '',
  _kanbanLanCuoiDung: 0,
  _kanbanSoLanLoi: 0,
  _kanbanDaGanSuKien: false,
  KANBAN_NHIP_MS: 10000,
  KANBAN_NGU_SAU_MS: 15 * 60 * 1000,

  _chuKyThe(d) {
    return [d.cot_kanban, d.thu_tu, d.trang_thai, d.designer, d.ngay_het_han].join('|');
  },

  _taoVanTayKanban(list) {
    return (list || []).map(d => d.ma_don + ':' + this._chuKyThe(d)).join(';');
  },

  _demThayDoiKanban(listMoi) {
    const cu = {};
    (this._kanbanData || []).forEach(d => { cu[d.ma_don] = this._chuKyThe(d); });
    let n = 0;
    const thay = {};
    (listMoi || []).forEach(d => {
      thay[d.ma_don] = true;
      if (cu[d.ma_don] === undefined || cu[d.ma_don] !== this._chuKyThe(d)) n++;
    });
    Object.keys(cu).forEach(ma => { if (!thay[ma]) n++; });
    return n;
  },

  _batDauTuDongCapNhatKanban() {
    clearTimeout(this._kanbanAutoTimer);
    this._kanbanVanTay      = this._taoVanTayKanban(this._kanbanData);
    this._kanbanVanTayBoQua = '';
    this._kanbanSoLanLoi    = 0;
    this._kanbanLanCuoiDung = Date.now();
    this._goBangThongBaoKanban();
    this._ganSuKienDanhThucKanban();
    this._henKiemTraKanban();
  },

  _dungTuDongCapNhatKanban() {
    clearTimeout(this._kanbanAutoTimer);
    this._kanbanAutoTimer = null;
    this._goBangThongBaoKanban();
  },

  _henKiemTraKanban(msTuChon) {
    clearTimeout(this._kanbanAutoTimer);
    const gianNhip = Math.pow(2, Math.min(this._kanbanSoLanLoi, 3));   // 1,2,4,8
    const nhip = msTuChon || (this.KANBAN_NHIP_MS * gianNhip);
    this._kanbanAutoTimer = setTimeout(() => this._kiemTraKanbanMoi(), nhip);
  },

  _dangNguKanban() {
    return (Date.now() - this._kanbanLanCuoiDung) > this.KANBAN_NGU_SAU_MS;
  },

  _ganSuKienDanhThucKanban() {
    if (this._kanbanDaGanSuKien) return;
    this._kanbanDaGanSuKien = true;
    const danhThuc = () => {
      const vuaNgu = this._dangNguKanban();
      this._kanbanLanCuoiDung = Date.now();
      if (vuaNgu && this.currentPage === 'kanban') {
        this._kanbanSoLanLoi = 0;
        this._henKiemTraKanban(300);   // tinh day -> kiem ngay
      }
    };
    ['mousedown', 'mousemove', 'keydown', 'touchstart', 'touchmove', 'wheel', 'scroll']
      .forEach(ev => document.addEventListener(ev, danhThuc, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) danhThuc(); });
  },

  async _kiemTraKanbanMoi() {
    if (this.currentPage !== 'kanban') { this._dungTuDongCapNhatKanban(); return; }
    if (!this.session?.accessToken)    { this._henKiemTraKanban(30000); return; }
    if (document.hidden)               { this._henKiemTraKanban(30000); return; }
    if (this._dangNguKanban())         { this._henKiemTraKanban(60000); return; }

    try {
      const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const list = (rows || []).filter(d => d.da_an !== 'yes');
      const vanTayMoi = this._taoVanTayKanban(list);
      this._kanbanSoLanLoi = 0;

      if (vanTayMoi === this._kanbanVanTay) {
        this._goBangThongBaoKanban();
      } else if (vanTayMoi !== this._kanbanVanTayBoQua) {
        this._hienBangThongBaoKanban(this._demThayDoiKanban(list), vanTayMoi);
      }
    } catch (e) {
      this._kanbanSoLanLoi++;
      console.warn('[Kanban kiem tra] lan loi thu ' + this._kanbanSoLanLoi + ':', e.message);
    }
    if (this.currentPage === 'kanban') this._henKiemTraKanban();
  },

  _hienBangThongBaoKanban(soThayDoi, vanTayMoi) {
    this._kanbanVanTayCho = vanTayMoi;
    let box = document.getElementById('kb-thong-bao-moi');
    if (!box) {
      box = document.createElement('div');
      box.id = 'kb-thong-bao-moi';
      box.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%);' +
        'z-index:900; display:flex; align-items:center; gap:12px; max-width:calc(100vw - 24px);' +
        'padding:10px 12px 10px 16px; border-radius:999px; background:#3F3428; color:#F5EFE6;' +
        'box-shadow:0 6px 20px rgba(0,0,0,0.25); font-size:13px; font-weight:600;';
      document.body.appendChild(box);
      box.innerHTML =
        '<span id="kb-thong-bao-chu" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></span>' +
        '<button type="button" onclick="App._capNhatKanbanNgay()" style="flex-shrink:0; border:none; cursor:pointer;' +
        'background:#C8A97E; color:#2B2318; font-weight:700; font-size:13px; padding:7px 14px; border-radius:999px;">Cập nhật</button>' +
        '<button type="button" aria-label="Bỏ qua" onclick="App._boQuaThongBaoKanban()" style="flex-shrink:0; border:none;' +
        'cursor:pointer; background:transparent; color:#C9BEB0; font-size:16px; line-height:1; padding:4px 6px;">✕</button>';
    }
    const chu = document.getElementById('kb-thong-bao-chu');
    if (chu) chu.textContent = soThayDoi > 0
      ? ('Có ' + soThayDoi + ' thay đổi mới trên bảng')
      : 'Bảng có thay đổi mới';
  },

  _goBangThongBaoKanban() {
    document.getElementById('kb-thong-bao-moi')?.remove();
  },

  _boQuaThongBaoKanban() {
    this._kanbanVanTayBoQua = this._kanbanVanTayCho || '';
    this._goBangThongBaoKanban();
  },

  async _capNhatKanbanNgay() {
    this._goBangThongBaoKanban();
    const tuKhoa    = document.getElementById('kb-search-input')?.value || '';
    const viTriCuon = document.getElementById('kb-board')?.scrollLeft || 0;
    await this.renderKanbanPage();
    if (tuKhoa) this._renderKanbanBoard(tuKhoa);
    const board = document.getElementById('kb-board');
    if (board) board.scrollLeft = viTriCuon;
    this._showToast('Đã cập nhật bảng', 'success', 2000);
  },

  _renderKanbanBoard(filterQ = '') {
    // Save scroll state before replacing innerHTML
    const board = document.getElementById('kb-board');
    const scrollState = {
      windowY: window.scrollY,
      boardX: board ? board.scrollLeft : 0,
      boardY: board ? board.scrollTop : 0,
      colsY: Array.from(document.querySelectorAll('.kb-col-body')).map(c => c.scrollTop)
    };

    const content = document.getElementById('page-content');
    const q = filterQ.toLowerCase();
    const donList = this._kanbanData || [];

    let filtered = q
      ? donList.filter(d =>
          (d.ma_don || '').toLowerCase().includes(q) ||
          (d.ten_khach || '').toLowerCase().includes(q) ||
          (d.brand || '').toLowerCase().includes(q))
      : [...donList];

    // Sort by thu_tu
    filtered.sort((a, b) => {
       const orderA = (a.thu_tu !== undefined && a.thu_tu !== '') ? parseFloat(a.thu_tu) : 0;
       const orderB = (b.thu_tu !== undefined && b.thu_tu !== '') ? parseFloat(b.thu_tu) : 0;
       return orderA - orderB;
    });

    // Group by cot_kanban
    const colMap = {};
    this.KANBAN_COLS.forEach(c => { colMap[c] = []; });
    filtered.forEach(d => {
      const col = d.cot_kanban || 'Đơn mới';
      if (!colMap[col]) colMap[col] = [];
      colMap[col].push(d);
    });

    const totalActive = filtered.filter(d => {
      const isRunning = !d.trang_thai || d.trang_thai === 'đang chạy';
      const isNotDone = (d.cot_kanban || '').trim().toLowerCase() !== 'hoàn thành đơn';
      return isRunning && isNotDone;
    }).length;

    content.innerHTML = `
      <div class="kb-wrapper">
        <div class="kb-topbar">
          <div class="kb-search-wrapper">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="kb-search" id="kb-search-input" placeholder="Tìm theo mã đơn, tên khách, brand..." value="${this._escHtml(filterQ)}" oninput="App._onKanbanSearch(this.value)" autocomplete="off"/>
          </div>
          <div class="kb-stats">
            <span class="kb-stat-badge">${totalActive} đơn đang chạy</span>
            ${this.session?.role === 'admin' ? `
              <button class="btn btn-ghost btn-sm" onclick="App._openDonDaAnModal()" style="color:#c0392b;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                Thùng rác
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="App.renderKanbanPage()">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Tải lại
            </button>
          </div>
        </div>

        <div class="kb-board" id="kb-board">
          ${this.KANBAN_COLS.map(col => this._renderKanbanCol(col, colMap[col] || [])).join('')}
        </div>
      </div>
    `;

    this._setupKanbanDnD();

    // Restore scroll state
    if (scrollState.windowY) window.scrollTo(0, scrollState.windowY);
    const newBoard = document.getElementById('kb-board');
    if (newBoard) {
       newBoard.scrollLeft = scrollState.boardX;
       newBoard.scrollTop = scrollState.boardY;
    }
    const newCols = document.querySelectorAll('.kb-col-body');
    newCols.forEach((c, i) => {
       if (scrollState.colsY[i]) c.scrollTop = scrollState.colsY[i];
    });

    // Tự động focus lại ô tìm kiếm nếu người dùng đang gõ
    if (filterQ) {
      setTimeout(() => {
        const searchInput = document.getElementById('kb-search-input');
        if (searchInput) {
          searchInput.focus();
          searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
        }
      }, 0);
    }
  },

  _renderKanbanCol(colName, cards) {
    const activeCount = cards.filter(d => !d.trang_thai || d.trang_thai === 'đang chạy').length;
    return `
      <div class="kb-col kb-col-${this._slugify(colName)}" data-col="${this._escHtml(colName)}"
           ondragover="App._onDragOver(event)" ondrop="App._onDrop(event, '${this._escHtml(colName)}')" ondragleave="App._onDragLeave(event)">
        <div class="kb-col-header">
          <span class="kb-col-title">${this._escHtml(colName)}</span>
          <span class="kb-col-count">${activeCount}</span>
        </div>
        <div class="kb-col-body" id="kb-col-${this._slugify(colName)}">
          ${cards.length === 0
            ? `<div class="kb-empty-drop">Kéo thẻ vào đây</div>`
            : cards.map(d => this._renderKanbanCard(d)).join('')}
        </div>
      </div>`;
  },

  _renderKanbanCard(d) {
    console.log(`[DEBUG diem don] thẻ ${d.ma_don}: đọc diem_don = ${d.diem_don}`);
    const isHuy        = d.trang_thai && d.trang_thai.toLowerCase().startsWith('hủy');
    const isDesigner   = this.session?.role === 'designer';
    const isSaleAdmin  = ['admin', 'sale'].includes(this.session?.role);
    const designers    = (this._kanbanDesignerMap[d.ma_don] || []).join(', ');
    const labels       = this._kanbanLabelMap?.[d.ma_don] || [];
    const deadline     = this._deadlineClass(d.ngay_het_han);
    const draggable    = isHuy ? 'false' : 'true';
    const cardStyle    = isHuy ? 'opacity:0.6; filter:grayscale(80%);' : '';

    const giaoDichList = (this._giaoDichTienList || []).filter(g => g.ma_don === d.ma_don);
    let daThucThu = 0;
    giaoDichList.forEach(g => {
       const tien = App._parseCurrency(g.so_tien);
       if (!isNaN(tien)) daThucThu += tien;
    });
    const tongGiaTri = App._parseCurrency(d.tong_gia_tri);
    const soPhaiThu = App._tinhSoPhaiThu(d);
    const isThuDu = soPhaiThu > 0 && daThucThu >= soPhaiThu;

    let dynamicStatus = 'Đang chạy';
    let statusBg = '#EDE6DA';
    let statusColor = '#876B4D';
    if (isHuy) {
      dynamicStatus = 'Đã hủy';
      statusBg = '#FCE9E9';
      statusColor = '#B4453C';
    } else if (d.cot_kanban === 'Hoàn thành đơn' && isThuDu) {
      dynamicStatus = 'Hoàn thành';
      statusBg = '#E6F4EA';
      statusColor = '#3B7A57';
    }

    // Label strips at top of card (poster, banner...)
    const labelsHtml = labels.length > 0
      ? labels.map(l => {
          const st = App._getLabelStyle(l.nhan);
          return `<span class="kb-label-pill" style="background:${st.bg}; color:${st.color}; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px;" title="${this._escHtml(l.nhan)}">${this._escHtml(l.nhan)}</span>`;
        }).join('')
      : '';

    const cancelLabel = `
      <span style="background:${statusBg}; color:${statusColor}; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px;">${dynamicStatus}</span>
      ${(isSaleAdmin && isThuDu) ? `<span style="background:#EDE6DA; color:#876B4D; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px;" title="Đã thu đủ tiền">Đã thu đủ</span>` : ''}
    `;

    const deadlineHtml = d.ngay_het_han
      ? `<div class="kb-card-deadline ${deadline}" style="margin-top:0;">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
           ${this._escHtml(d.ngay_het_han)}
         </div>` : '';

    const designerHtml = designers
      ? `<div class="kb-card-designer">
           <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
           ${this._escHtml(designers)}
         </div>` : '';

    const maKhText = (!isDesigner && d.ma_kh) ? `<span style="color:var(--clr-text-muted); font-size:12px;">${this._escHtml(d.ma_kh)}</span>` : '';

    const designersList = this._kanbanDesignerMap?.[d.ma_don] || [];
    const avatarsHtml = designersList.length > 0 ? `<div style="display:flex; gap:4px; margin-left:auto; align-items:center;">` + designersList.map(name => {
      const parts = name.trim().split(/\s+/);
      let initials = '?';
      if (parts.length >= 2) {
         initials = (parts[0][0] + parts[1][0]).toUpperCase();
      } else if (parts.length === 1 && parts[0]) {
         initials = parts[0][0].toUpperCase();
      }
      let hash = 0;
      for(let i=0; i<name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
      const colors = ['#8A724C', '#E74C3C', '#2ECC71', '#3498DB', '#9B59B6', '#F39C12', '#16A085', '#34495E'];
      const bg = colors[Math.abs(hash) % colors.length];
      return `<div title="${this._escHtml(name)}" style="width:24px;height:24px;border-radius:50%;background:${bg};color:#fff;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;cursor:pointer;">${initials}</div>`;
    }).join('') + `</div>` : '';

    return `
      <div class="kb-card ${isHuy ? 'kb-card-cancelled' : ''}"
           data-don="${this._escHtml(d.ma_don)}"
           draggable="${draggable}"
           ondragstart="App._onDragStart(event, '${this._escHtml(d.ma_don)}')"
           ondragend="App._onDragEnd(event)"
           onclick="App._openCardDetail('${this._escHtml(d.ma_don)}')"
           style="${cardStyle}">
        <div style="display:flex; flex-direction:column; gap:10px;">
          <!-- ID & KH -->
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span style="background:#F5EFE6; color:#2A2420; font-weight:700; padding:4px 10px; border-radius:12px; font-size:12px;">${this._escHtml(d.ma_don)}</span>
            ${d.diem_don !== undefined && d.diem_don !== '' ? `<span style="background:#9C7E5E; color:#FFF; font-weight:700; padding:4px 10px; border-radius:999px; font-size:11px;">Điểm: ${this._escHtml(d.diem_don)}</span>` : ''}
            ${maKhText}
          </div>
          <!-- Tags -->
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${labelsHtml}
            ${cancelLabel}
            ${d.item ? `<span class="kb-tag kb-tag-item">${this._escHtml(d.item)}</span>` : ''}
          </div>
          <!-- Khách hàng -->
          <div class="kb-card-name" style="font-size:14px;">${this._escHtml(d.ten_khach || '')}</div>
          <!-- Footer -->
          <div class="kb-card-footer" style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
            ${deadlineHtml}
            ${avatarsHtml}
          </div>
        </div>
      </div>`;
  },

  _formatDatetimeLocal(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    let dStr = '', tStr = '';
    const dateTrim = dateStr.trim();
    if (!dateTrim) return '';
    
    if (dateTrim.includes('T')) {
       const isoParts = dateTrim.split('T');
       dStr = isoParts[0];
       tStr = isoParts[1] || '00:00';
    } else {
       const parts = dateTrim.split(/\s+/);
       dStr = parts[0];
       tStr = parts[1] || '00:00';
    }
    
    let y, m, d;
    if (dStr.includes('/')) {
       [d, m, y] = dStr.split('/');
    } else if (dStr.includes('-')) {
       [y, m, d] = dStr.split('-');
    } else {
       return '';
    }
    
    if (!y || !m || !d) return '';
    if (y.length === 2) y = '20' + y;
    
    y = y.padStart(4, '0');
    m = m.padStart(2, '0');
    d = d.padStart(2, '0');
    
    let [hh, mm] = tStr.split(':');
    if (!hh) hh = '00';
    if (!mm) mm = '00';
    hh = hh.padStart(2, '0');
    mm = mm.padStart(2, '0');
    
    const hour = parseInt(hh, 10);
    const minute = parseInt(mm, 10);
    if (isNaN(hour) || hour > 23 || hour < 0) hh = '00';
    if (isNaN(minute) || minute > 59 || minute < 0) mm = '00';
    
    return `${y}-${m}-${d}T${hh}:${mm}`;
  },

  _getLabelStyle(nhan) {
    switch (nhan) {
      case 'Gấp': return { bg: '#FCE9E9', color: '#B4453C' };
      case 'Ưu tiên': return { bg: '#FCEFE0', color: '#B5763A' };
      case 'Đã thanh toán': return { bg: '#E8F5E9', color: '#3B7A57' };
      case 'Chỉnh sửa nhỏ': return { bg: '#F3EFFB', color: '#6B5B95' };
      case 'Đúng deadline': return { bg: '#E6F4EA', color: '#3B7A57' };
      case 'Lưu trữ': return { bg: '#EFEFEF', color: '#888888' };
      default: return { bg: '#F3EFFB', color: '#6B5B95' };
    }
  },

  _deadlineClass(dateStr) {
    const iso = this._formatDatetimeLocal(dateStr);
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const diff = (d - now) / (1000 * 60 * 60 * 24);
    if (diff < 0)  return 'kb-deadline-overdue';
    if (diff <= 2) return 'kb-deadline-urgent';
    if (diff <= 7) return 'kb-deadline-soon';
    return '';
  },

  _slugify(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd').replace(/\s+/g,'_').replace(/[^a-z0-9_]/gi,'').toLowerCase();
  },

  _onKanbanSearch(q) {
    clearTimeout(this._kanbanSearchTimer);
    this._kanbanSearchTimer = setTimeout(() => this._renderKanbanBoard(q), 200);
  },

  // ── Drag & Drop ──────────────────────────────────────────────
  _stopDragScroll() {
    if (this._dragScrollInterval) {
      clearInterval(this._dragScrollInterval);
      this._dragScrollInterval = null;
    }
  },

  _setupKanbanDnD() { 
    this._draggingDon = null; 
    this._stopDragScroll();
    this._currentDragSpeed = 0;

    const board = document.getElementById('kb-board');
    if (!board) return;

    this._onDragOverBoard = (ev) => {
      const rect = board.getBoundingClientRect();
      const x = ev.clientX;
      const EDGE = 150; // pixels from edge to trigger scroll
      let speed = 0;

      if (x > rect.right - EDGE) {
        speed = ((x - (rect.right - EDGE)) / EDGE) * 25;
      } else if (x < rect.left + EDGE) {
        speed = -((((rect.left + EDGE) - x) / EDGE) * 25);
      }

      if (speed !== 0) {
        this._currentDragSpeed = speed;
        if (!this._dragScrollInterval) {
          this._dragScrollInterval = setInterval(() => {
            if (board) board.scrollLeft += this._currentDragSpeed;
          }, 16);
        }
      } else {
        this._stopDragScroll();
      }
    };

    board.addEventListener('dragover', this._onDragOverBoard);
    board.addEventListener('drop', () => this._stopDragScroll());
    board.addEventListener('dragleave', (ev) => {
       const rect = board.getBoundingClientRect();
       if (ev.clientX <= rect.left || ev.clientX >= rect.right || ev.clientY <= rect.top || ev.clientY >= rect.bottom) {
          this._stopDragScroll();
       }
    });
  },

  _onDragStart(ev, maDon) {
    this._draggingDon = maDon;
    ev.dataTransfer.effectAllowed = 'move';
    ev.dataTransfer.setData('text/plain', maDon);
    setTimeout(() => ev.target.classList.add('kb-card-dragging'), 0);
  },

  _onDragEnd(ev) { 
    ev.target.classList.remove('kb-card-dragging'); 
    this._stopDragScroll();
  },
  _onDragLeave(ev) { ev.currentTarget.classList.remove('kb-col-over'); },

  _onDragOver(ev) {
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    ev.currentTarget.classList.add('kb-col-over');
  },

  _getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.kb-card:not(.kb-card-dragging)')];
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  },

  async _onDrop(ev, newCol) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('kb-col-over');
    const maDon = this._draggingDon || ev.dataTransfer.getData('text/plain');
    if (!maDon) return;

    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) return;
    if (don.trang_thai && don.trang_thai.toLowerCase().startsWith('hủy')) return;

    const container = ev.currentTarget.querySelector('.kb-col-body');
    const afterElement = this._getDragAfterElement(container, ev.clientY);

    const oldCol = don.cot_kanban;
    const oldThuTu = don.thu_tu;

    let newThuTu = 0;
    let colCards = (this._kanbanData || []).filter(d => d.cot_kanban === newCol && d.ma_don !== maDon);
    colCards.sort((a, b) => {
       const orderA = (a.thu_tu !== undefined && a.thu_tu !== '') ? parseFloat(a.thu_tu) : 0;
       const orderB = (b.thu_tu !== undefined && b.thu_tu !== '') ? parseFloat(b.thu_tu) : 0;
       return orderA - orderB;
    });

    if (afterElement) {
       const afterMaDon = afterElement.getAttribute('data-don');
       const afterIndex = colCards.findIndex(d => d.ma_don === afterMaDon);
       if (afterIndex === 0) {
          newThuTu = (parseFloat(colCards[0].thu_tu) || 0) - 1000;
       } else if (afterIndex > 0) {
          const prevThuTu = parseFloat(colCards[afterIndex - 1].thu_tu) || 0;
          const nextThuTu = parseFloat(colCards[afterIndex].thu_tu) || 0;
          newThuTu = (prevThuTu + nextThuTu) / 2;
       }
    } else {
       if (colCards.length === 0) {
          newThuTu = 1000;
       } else {
          newThuTu = (parseFloat(colCards[colCards.length - 1].thu_tu) || 0) + 1000;
       }
    }

    if (don.cot_kanban === newCol && don.thu_tu == newThuTu) return;

    // INTERCEPT BƯỚC 2: Kiểm tra nếu kéo vào "GỬI KHÁCH HÀNG" hoặc "CHỜ KHÁCH HÀNG PHẢN HỒI" và chưa ghi điểm xử lý
    if ((newCol === 'GỬI KHÁCH HÀNG' || newCol === 'CHỜ KHÁCH HÀNG PHẢN HỒI') && don.da_ghi_diem_xu_ly !== 'yes') {
      this._openChotDiemModal(maDon, oldCol, oldThuTu, newCol, newThuTu);
      return;
    }

    this._applyKanbanDrop(maDon, oldCol, oldThuTu, newCol, newThuTu);
  },

  async _applyKanbanDrop(maDon, oldCol, oldThuTu, newCol, newThuTu) {
    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) return;

    don.cot_kanban = newCol;
    don.thu_tu = newThuTu;

    this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');

    try {
      await this._kanbanUpdateCotKanbanVaThuTu(maDon, newCol, newThuTu);
      this._showToast(`✅ Cập nhật vị trí ${maDon}`, 'success', 2500);
    } catch (e) {
      don.cot_kanban = oldCol;
      don.thu_tu = oldThuTu;
      this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
      this._showToast(`Lỗi cập nhật: ${e.message}`, 'error');
    }
  },

  _openChotDiemModalFromPopup(maDon) {
    console.log('[DEBUG chot diem] đã mở hộp cho maDon:', maDon);
    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) { console.warn('[DEBUG chot diem] không tìm thấy don với maDon:', maDon); return; }
    this._openChotDiemModal(maDon, don.cot_kanban, don.thu_tu, don.cot_kanban, don.thu_tu, true);
  },

  async _openSuaDiemXuLyModal(maDon) {
    if (this.session?.role !== 'admin') return;
    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) return;

    this._showToast('Đang tải dữ liệu điểm...', 'info');
    try {
      const diemRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY);
      const assignedDesigners = this._kanbanDesignerMap[maDon] || [];
      
      const rows = assignedDesigners.map(d => {
         const matchingRow = diemRows.find(r => r.ma_don === maDon && r.ten_designer === d);
         const score = matchingRow && matchingRow.diem !== undefined ? matchingRow.diem : '';
         return { designer: d, score: score };
      });

      const existing = document.getElementById('chot-diem-overlay');
      if (existing) existing.remove();

      this._chotDiemState = {
        maDon, oldCol: don.cot_kanban, oldThuTu: don.thu_tu, newCol: don.cot_kanban, newThuTu: don.thu_tu, isFromPopup: true,
        rows: rows,
        isEditMode: true
      };

      const html = `
        <div id="chot-diem-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px);">
          <div style="background:var(--clr-card); width:400px; max-width:90%; border-radius:var(--radius-lg); box-shadow:var(--shadow-lg); overflow:hidden; display:flex; flex-direction:column;">
            <div style="padding:16px 20px; border-bottom:1px solid var(--clr-border-light); display:flex; justify-content:space-between; align-items:center; background:var(--clr-surface);">
              <h2 class="kb-detail-title" style="margin:0; font-size:18px;">Sửa lại điểm xử lý — ${this._escHtml(maDon)}</h2>
              <button class="kb-detail-close" onclick="App._closeChotDiemModal()" style="background:none; border:none; cursor:pointer; font-size:16px; color:var(--clr-text);">✕</button>
            </div>
            <div style="padding:20px; display:flex; flex-direction:column; gap:16px;">
              <div id="chot-diem-rows" style="display:flex; flex-direction:column; gap:12px;">
                ${this._renderChotDiemRows()}
              </div>
              <button class="btn btn-ghost btn-sm" onclick="App._addChotDiemRow()" style="margin-bottom:16px; border:1px dashed var(--clr-border); width:100%;">+ Thêm designer</button>
            </div>
            <div style="padding:16px 20px; border-top:1px solid var(--clr-border-light); background:var(--clr-surface); display:flex; justify-content:flex-end; gap:12px;">
              <button class="btn btn-ghost" onclick="App._closeChotDiemModal()">Hủy</button>
              <button class="btn btn-primary" onclick="App._confirmSuaDiemXuLy()">Lưu điểm</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi tải điểm: ' + err.message, 'error');
    }
  },

  async _confirmSuaDiemXuLy() {
    if (!this._chotDiemState || this._isChotDiemProcessing || !this._chotDiemState.isEditMode) return;
    this._isChotDiemProcessing = true;

    try {
      const { maDon, rows } = this._chotDiemState;
      const finalData = {};
      rows.forEach(r => {
        if (!r.designer || r.designer.trim() === '') return;
        const name = r.designer.trim();
        const scoreStr = r.score.toString().trim();
        if (scoreStr !== '') {
          const score = parseFloat(scoreStr.replace(/,/g, '.'));
          if (!isNaN(score)) finalData[name] = score;
        }
      });

      const uniqueDesigners = Object.keys(finalData);
      if (uniqueDesigners.length === 0) {
        this._showToast('Vui lòng nhập điểm cho ít nhất 1 designer', 'warning');
        this._isChotDiemProcessing = false;
        return;
      }

      this._showToast('Đang lưu lại điểm...', 'info');
      const diemRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY);

      let successCount = 0;
      for (const name of uniqueDesigners) {
         const diemMoi = finalData[name];
         const rowIdx = diemRows.findIndex(r => r.ma_don === maDon && r.ten_designer === name);
         if (rowIdx === -1) {
            this._showToast(`Lỗi: Không tìm thấy dòng điểm cũ của designer ${name}`, 'error');
            continue; 
         }
         
         const sheetRow = rowIdx + 2;
         await this._writeSheet(CONFIG.SHEETS.DIEM_XU_LY, `C${sheetRow}`, [[diemMoi]]);
         successCount++;
      }

      if (successCount > 0) {
         this._showToast('Đã lưu lại điểm xử lý!', 'success');
         this._closeChotDiemModal();
         this._openCardDetail(maDon); 
      }
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi lưu điểm: ' + err.message, 'error');
    } finally {
      this._isChotDiemProcessing = false;
    }
  },

  _openChotDiemModal(maDon, oldCol, oldThuTu, newCol, newThuTu, isFromPopup = false) {
    const existing = document.getElementById('chot-diem-overlay');
    if (existing) existing.remove();

    const assignedDesigners = this._kanbanDesignerMap[maDon] || [];
    const tempScores = this._kanbanDiemXuLyMap?.[maDon] || {};

    this._chotDiemState = {
      maDon, oldCol, oldThuTu, newCol, newThuTu, isFromPopup,
      // Đã gỡ chức năng nhập điểm ngoài popup, hộp chốt luôn khởi tạo điểm rỗng
      rows: assignedDesigners.map(d => ({ designer: d, score: '' }))
    };

    const overlay = document.createElement('div');
    overlay.id = 'chot-diem-overlay';
    overlay.className = 'kb-overlay';
    overlay.innerHTML = `
      <div class="kb-detail-modal" style="max-width: 500px; background:var(--clr-bg); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; max-height:90vh; margin: 5vh auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
        <div class="kb-detail-header" style="padding:16px; border-bottom:1px solid var(--clr-border); display:flex; justify-content:space-between; align-items:center;">
          <h2 class="kb-detail-title" style="margin:0; font-size:18px;">Chốt điểm xử lý — ${this._escHtml(maDon)}</h2>
          <button class="kb-detail-close" onclick="App._closeChotDiemModal()" style="background:none; border:none; cursor:pointer; font-size:16px; color:var(--clr-text);">✕</button>
        </div>
        <div class="kb-detail-body" style="padding: 16px; overflow-y:auto;">
          <div id="chot-diem-rows" style="display:flex; flex-direction:column; gap:8px; margin-bottom:16px;">
            ${this._renderChotDiemRows()}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="App._addChotDiemRow()" style="margin-bottom:16px; border:1px dashed var(--clr-border); width:100%;">+ Thêm designer</button>
          
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-ghost" onclick="App._closeChotDiemModal()">Hủy</button>
            <button class="btn btn-primary" onclick="App._confirmChotDiem()">Xác nhận</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    // Thêm class để kích hoạt CSS fade-in
    requestAnimationFrame(() => {
      overlay.classList.add('kb-overlay-visible');
    });

    setTimeout(() => {
      console.log('[DEBUG chot diem] modal đã gắn vào trang, hiển thị =', {
        className: overlay.className,
        display: getComputedStyle(overlay).display,
        opacity: getComputedStyle(overlay).opacity,
        zIndex: getComputedStyle(overlay).zIndex
      });
    }, 50);
  },

  _renderChotDiemRows() {
    if (!this._chotDiemState) return '';
    const allDesigners = (this._nhanSuList || []).filter(n => n.vai_tro === 'designer').map(n => n.ten || n.ho_ten || n.ten_nhan_vien || n.email || '');
    
    return this._chotDiemState.rows.map((row, idx) => {
      const options = `<option value="">-- Chọn designer --</option>` + 
        allDesigners.map(d => `<option value="${this._escHtml(d)}" ${d === row.designer ? 'selected' : ''}>${this._escHtml(d)}</option>`).join('');
      
      return `
        <div class="chot-diem-row" data-index="${idx}" style="display:flex; gap:8px; align-items:center;">
          <select class="form-input chot-diem-designer" style="flex:1; min-width:200px;" onchange="App._updateChotDiemState(${idx}, 'designer', this.value)">
            ${options}
          </select>
          <input type="text" class="form-input chot-diem-score" value="${this._escHtml(row.score)}" placeholder="Điểm" style="width:80px;" oninput="App._updateChotDiemState(${idx}, 'score', this.value)" />
          <button class="btn btn-ghost btn-sm" onclick="App._removeChotDiemRow(${idx})" style="color:#E74C3C; padding:0 8px; border:none; background:none;">✕</button>
        </div>
      `;
    }).join('');
  },

  _updateChotDiemState(idx, field, val) {
    if (this._chotDiemState && this._chotDiemState.rows[idx]) {
      this._chotDiemState.rows[idx][field] = val;
    }
  },

  _addChotDiemRow() {
    if (this._chotDiemState) {
      this._chotDiemState.rows.push({ designer: '', score: '' });
      const container = document.getElementById('chot-diem-rows');
      if (container) container.innerHTML = this._renderChotDiemRows();
    }
  },

  _removeChotDiemRow(idx) {
    if (this._chotDiemState) {
      this._chotDiemState.rows.splice(idx, 1);
      const container = document.getElementById('chot-diem-rows');
      if (container) container.innerHTML = this._renderChotDiemRows();
    }
  },

  _closeChotDiemModal() {
    const existing = document.getElementById('chot-diem-overlay');
    if (existing) existing.remove();
    const isFromPopup = this._chotDiemState?.isFromPopup;
    this._chotDiemState = null;
    // Bật ngược thẻ về vị trí cũ bằng cách re-render board mà không update data
    if (!isFromPopup) {
      this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
    }
  },

  async _confirmChotDiem() {
    if (!this._chotDiemState || this._isChotDiemProcessing) return;
    this._isChotDiemProcessing = true; // Khóa nút để tránh bấm đúp (double-click)

    const { maDon, oldCol, oldThuTu, newCol, newThuTu, isFromPopup, rows } = this._chotDiemState;

    // AUTO-SAVE: Cố gắng lưu các trường thông thường trên popup trước khi thực hiện chốt điểm
    if (isFromPopup) {
      try {
        console.log(`[DEBUG] Auto-saving card details for ${maDon} before action...`);
        await this._saveCardDetail(maDon);
      } catch (saveErr) {
        console.warn(`[DEBUG] Lỗi auto-save trước khi chốt điểm (không block luồng):`, saveErr);
      }
    }

    try {
      // 1. Chỉ lấy dòng có điểm > 0 và LOẠI BỎ TRÙNG LẶP designer
      const finalData = {};
      rows.forEach(r => {
        if (!r.designer || r.designer.trim() === '') return;
        const name = r.designer.trim();
        const score = parseFloat(r.score.toString().replace(/,/g, '.'));
        if (!isNaN(score) && score > 0) {
          finalData[name] = score; // Nếu trùng tên, giá trị sau sẽ ghi đè giá trị trước
        }
      });

      const uniqueDesigners = Object.keys(finalData);
      if (uniqueDesigners.length === 0) {
        this._showToast('Vui lòng nhập điểm > 0 cho ít nhất 1 designer', 'warning');
        this._isChotDiemProcessing = false;
        return;
      }

      const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
      const coHienTai = don ? don.da_ghi_diem_xu_ly : '';

      // --- BƯỚC KIỂM TRA TỔNG ĐIỂM (Không được vượt Điểm đơn) ---
      let totalDesignerScore = 0;
      uniqueDesigners.forEach(name => totalDesignerScore += finalData[name]);

      const diemDonVal = don && don.diem_don !== undefined && don.diem_don !== '' ? parseFloat(don.diem_don) : NaN;
      if (!isNaN(diemDonVal)) {
        if (totalDesignerScore > diemDonVal) {
          console.log(`[DEBUG chot diem] tổng điểm designer = ${totalDesignerScore}, điểm đơn = ${diemDonVal}, hợp lệ = false`);
          this._showToast(`Tổng điểm designer (${totalDesignerScore}) không được lớn hơn điểm đơn (${diemDonVal}). Vui lòng nhập lại.`, 'error');
          this._isChotDiemProcessing = false;
          return; // Chặn quá trình ghi
        } else {
          console.log(`[DEBUG chot diem] tổng điểm designer = ${totalDesignerScore}, điểm đơn = ${diemDonVal}, hợp lệ = true`);
        }
      } else {
        console.log('[DEBUG chot diem] điểm đơn trống, bỏ qua kiểm tra');
      }
      // --------------------------------------------------------

      console.log('[DEBUG chot diem] bấm xác nhận - danh sách:', finalData);
      this._showToast('Đang ghi điểm xử lý...', 'info');
      const todayStr = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

      // 2. TẠM BỎ bước xóa các dòng cũ của mã đơn trong DIEM_XU_LY (tránh lỗi undefined row index)
      // Việc xử lý chống trùng dòng sẽ được làm ở lệnh sau như yêu cầu.
      
      // 3. Append dòng mới vào DIEM_XU_LY (ngày prefix "'" để ép Google Sheets ghi chuỗi)
      const appendValues = uniqueDesigners.map(name => [
        maDon,
        name,
        finalData[name],
        "'" + todayStr
      ]);

      if (appendValues.length > 0) {
        console.log(`[DEBUG chot diem] danh sách sau khi lọc, độ dài = ${appendValues.length}:`, appendValues);
        await this._appendSheet(CONFIG.SHEETS.DIEM_XU_LY, appendValues);
        console.log(`[DEBUG chot diem] đã append ${appendValues.length} dòng vào DIEM_XU_LY xong`);
      }

      // 4. Đặt cờ da_ghi_diem_xu_ly trong DON_HANG
      const donHangRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const donRowIdx = donHangRows.findIndex(r => r.ma_don === maDon);
      if (donRowIdx !== -1) {
        const headerRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
          { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
        );
        const headerData = await headerRes.json();
        const headers = (headerData.values || [[]])[0] || [];
        const flagIdx = headers.indexOf('da_ghi_diem_xu_ly');
        if (flagIdx >= 0) {
          const flagLetter = this._colIndexToLetter(flagIdx);
          const sheetRow = donRowIdx + 2; // +1 cho header, +1 vì mảng index bắt đầu từ 0
          await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${flagLetter}${sheetRow}`, [['yes']]);
          console.log(`[DEBUG chot diem] đã đặt cờ yes cho mã đơn: ${maDon} tại ô ${flagLetter}${sheetRow}`);
        }
      }

      // 5. Cập nhật state local
      if (don) don.da_ghi_diem_xu_ly = 'yes';

      // 6. Log kết quả
      console.log('[DEBUG chot diem] Xác nhận chốt điểm và đặt cờ:', {
        maDon: maDon,
        coHienTai: coHienTai,
        duLieuDaGhi: finalData,
        coMoi: 'yes'
      });

      this._showToast('✅ Đã chốt điểm xử lý thành công!', 'success');

      const overlay = document.getElementById('chot-diem-overlay');
      if (overlay) overlay.remove();
      this._chotDiemState = null;

      if (isFromPopup) {
        this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
        this._openCardDetail(maDon);
      } else {
        this._applyKanbanDrop(maDon, oldCol, oldThuTu, newCol, newThuTu);
      }
    } catch (e) {
      console.error(e);
      this._showToast(`Lỗi chốt điểm: ${e.message}`, 'error');
    } finally {
      this._isChotDiemProcessing = false;
    }
  },

  _confirmAndOpenSuaDiemLuongModal(maDon) {
    if (confirm(`Đơn này đã được tính vào lương. Sửa điểm lương sẽ thay đổi lương của designer ở kỳ lương tương ứng (tháng theo ngày duyệt mẫu của đơn). Bạn chắc chắn muốn sửa?`)) {
      this._openSuaDiemLuongModal(maDon);
    }
  },

  async _openSuaDiemLuongModal(maDon) {
    if (this.session?.role !== 'admin') return;
    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) return;

    this._showToast('Đang tải dữ liệu điểm lương...', 'info');
    try {
      const diemRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER);
      const assignedDesigners = this._kanbanDesignerMap[maDon] || [];
      
      const rows = assignedDesigners.map(d => {
         const matchingRow = diemRows.find(r => r.ma_don === maDon && r.ten_designer === d);
         const score = matchingRow && matchingRow.diem !== undefined ? matchingRow.diem : '';
         return { designer: d, score: score };
      });

      const existing = document.getElementById('chot-luong-overlay');
      if (existing) existing.remove();

      this._chotLuongState = { maDon, rows: rows, isEditMode: true };

      const overlay = document.createElement('div');
      overlay.id = 'chot-luong-overlay';
      overlay.className = 'kb-overlay';
      overlay.innerHTML = `
        <div class="kb-detail-modal" style="max-width: 500px; background:var(--clr-bg); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; max-height:90vh; margin: 5vh auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
          <div class="kb-detail-header" style="padding:16px; border-bottom:1px solid var(--clr-border); display:flex; justify-content:space-between; align-items:center;">
            <h2 class="kb-detail-title" style="margin:0; font-size:18px;">Sửa lại điểm lương — ${this._escHtml(maDon)}</h2>
            <button class="kb-detail-close" onclick="App._closeChotLuongModal()" style="background:none; border:none; cursor:pointer; font-size:16px; color:var(--clr-text);">✕</button>
          </div>
          <div class="kb-detail-body" style="padding: 16px; overflow-y:auto;">
            <div id="chot-luong-rows" style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
              ${this._renderChotLuongRows()}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="App._addChotLuongRow()" style="margin-bottom:16px; border:1px dashed var(--clr-border); width:100%;">+ Thêm designer</button>
            
            <div id="chot-luong-summary" style="margin-bottom:16px; padding:12px; background:rgba(0,0,0,0.02); border-radius:8px; border:1px solid var(--clr-border-light);"></div>
            
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="btn btn-ghost" onclick="App._closeChotLuongModal()">Hủy</button>
              <button class="btn btn-secondary" style="background:#e74c3c; color:#FFF; border-color:#e74c3c;" onclick="App._confirmSuaDiemLuong()">Lưu điểm</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      
      requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));
      this._updateChotLuongTotal();
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi tải điểm lương: ' + err.message, 'error');
    }
  },

  async _confirmSuaDiemLuong() {
    if (!this._chotLuongState || this._isChotLuongProcessing || !this._chotLuongState.isEditMode) return;
    this._isChotLuongProcessing = true;

    const { maDon, rows } = this._chotLuongState;

    // AUTO-SAVE: Cố gắng lưu các trường thông thường trên popup trước khi sửa điểm lương
    try {
      console.log(`[DEBUG] Auto-saving card details for ${maDon} before action...`);
      await this._saveCardDetail(maDon);
    } catch (saveErr) {
      console.warn(`[DEBUG] Lỗi auto-save trước khi sửa điểm lương (không block luồng):`, saveErr);
    }

    try {
      const finalData = {};
      rows.forEach(r => {
        if (!r.designer || r.designer.trim() === '') return;
        const name = r.designer.trim();
        const scoreStr = r.score.toString().trim();
        if (scoreStr !== '') {
          const score = parseFloat(scoreStr.replace(/,/g, '.'));
          if (!isNaN(score)) finalData[name] = score;
        }
      });

      const uniqueDesigners = Object.keys(finalData);
      if (uniqueDesigners.length === 0) {
        this._showToast('Vui lòng nhập điểm cho ít nhất 1 designer', 'warning');
        this._isChotLuongProcessing = false;
        return;
      }

      this._showToast('Đang lưu lại điểm lương...', 'info');
      const diemRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER);

      let successCount = 0;
      for (const name of uniqueDesigners) {
         const diemMoi = finalData[name];
         const rowIdx = diemRows.findIndex(r => r.ma_don === maDon && r.ten_designer === name);
         if (rowIdx === -1) {
            this._showToast(`Lỗi: Không tìm thấy dòng điểm cũ của designer ${name}`, 'error');
            continue; 
         }
         
         const sheetRow = rowIdx + 2;
         await this._writeSheet(CONFIG.SHEETS.DIEM_DESIGNER, `C${sheetRow}`, [[diemMoi]]);
         successCount++;
      }

      if (successCount > 0) {
         this._showToast('Đã lưu lại điểm lương!', 'success');
         this._closeChotLuongModal();
         this._openCardDetail(maDon); 
      }
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi lưu điểm lương: ' + err.message, 'error');
    } finally {
      this._isChotLuongProcessing = false;
    }
  },

  _openChotLuongModal(maDon) {
    const existing = document.getElementById('chot-luong-overlay');
    if (existing) existing.remove();

    const assignedDesigners = this._kanbanDesignerMap[maDon] || [];
    const rows = assignedDesigners.map(d => ({ designer: d, score: '' }));
    if (rows.length === 0) rows.push({ designer: '', score: '' });

    this._chotLuongState = { maDon, rows };

    const overlay = document.createElement('div');
    overlay.id = 'chot-luong-overlay';
    overlay.className = 'kb-overlay';
    overlay.innerHTML = `
      <div class="kb-detail-modal" style="max-width: 500px; background:var(--clr-bg); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; max-height:90vh; margin: 5vh auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
        <div class="kb-detail-header" style="padding:16px; border-bottom:1px solid var(--clr-border); display:flex; justify-content:space-between; align-items:center;">
          <h2 class="kb-detail-title" style="margin:0; font-size:18px;">Chốt điểm lương — ${this._escHtml(maDon)}</h2>
          <button class="kb-detail-close" onclick="App._closeChotLuongModal()" style="background:none; border:none; cursor:pointer; font-size:16px; color:var(--clr-text);">✕</button>
        </div>
        <div class="kb-detail-body" style="padding: 16px; overflow-y:auto;">
          <div id="chot-luong-rows" style="display:flex; flex-direction:column; gap:8px; margin-bottom:8px;">
            ${this._renderChotLuongRows()}
          </div>
          <button class="btn btn-ghost btn-sm" onclick="App._addChotLuongRow()" style="margin-bottom:16px; border:1px dashed var(--clr-border); width:100%;">+ Thêm designer</button>
          
          <div id="chot-luong-summary" style="margin-bottom:16px; padding:12px; background:rgba(0,0,0,0.02); border-radius:8px; border:1px solid var(--clr-border-light);"></div>
          
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button class="btn btn-ghost" onclick="App._closeChotLuongModal()">Hủy</button>
            <button class="btn btn-secondary" style="background:#8E44AD; color:#FFF; border-color:#8E44AD;" onclick="App._confirmChotLuong()">Xác nhận</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));
    console.log(`[DEBUG chot luong] đã mở hộp cho maDon: ${maDon}`);
    this._updateChotLuongTotal();
  },

  _renderChotLuongRows() {
    if (!this._chotLuongState) return '';
    const allDesigners = (this._nhanSuList || []).filter(n => n.vai_tro === 'designer').map(n => n.ten || n.ho_ten || n.ten_nhan_vien || n.email || '');
    
    return this._chotLuongState.rows.map((row, idx) => {
      const options = `<option value="">-- Chọn designer --</option>` + 
        allDesigners.map(d => `<option value="${this._escHtml(d)}" ${d === row.designer ? 'selected' : ''}>${this._escHtml(d)}</option>`).join('');
      
      return `
        <div class="chot-luong-row" data-index="${idx}" style="display:flex; gap:8px; align-items:center;">
          <select class="form-input chot-luong-designer" style="flex:1; min-width:200px;" onchange="App._updateChotLuongState(${idx}, 'designer', this.value)">
            ${options}
          </select>
          <input type="number" step="any" min="0" class="form-input chot-luong-score" value="${this._escHtml(row.score)}" placeholder="Điểm" style="width:80px;" oninput="App._updateChotLuongState(${idx}, 'score', this.value)" />
          <button class="btn btn-ghost btn-sm" onclick="App._removeChotLuongRow(${idx})" style="color:#E74C3C; padding:0 8px; border:none; background:none;">✕</button>
        </div>
      `;
    }).join('');
  },

  _updateChotLuongState(idx, field, val) {
    if (this._chotLuongState && this._chotLuongState.rows[idx]) {
      this._chotLuongState.rows[idx][field] = val;
      if (field === 'score') {
        this._updateChotLuongTotal();
      }
    }
  },

  _updateChotLuongTotal() {
    if (!this._chotLuongState) return;
    const maDon = this._chotLuongState.maDon;
    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    const diemDon = don ? (parseFloat(don.diem_don) || 0) : 0;
    
    const total = this._chotLuongState.rows.reduce((sum, r) => sum + (parseFloat(r.score) || 0), 0);
    
    const summaryDiv = document.getElementById('chot-luong-summary');
    if (summaryDiv) {
      const isOver = total > diemDon;
      let html = `<div style="font-weight:600; font-size:14px; color:var(--clr-text);">Tổng điểm designer: <span style="color:${isOver ? '#e74c3c' : '#2ecc71'};">${Number(total.toFixed(2))}</span> / Điểm đơn: ${Number(diemDon.toFixed(2))}</div>`;
      if (isOver) {
        html += `<div style="color:#e74c3c; font-size:12px; font-weight:600; margin-top:4px;">⚠ Tổng điểm designer vượt quá điểm đơn. Kiểm tra lại.</div>`;
      }
      summaryDiv.innerHTML = html;
    }
  },

  _addChotLuongRow() {
    if (this._chotLuongState) {
      this._chotLuongState.rows.push({ designer: '', score: '' });
      const container = document.getElementById('chot-luong-rows');
      if (container) container.innerHTML = this._renderChotLuongRows();
    }
  },

  _removeChotLuongRow(idx) {
    if (this._chotLuongState) {
      this._chotLuongState.rows.splice(idx, 1);
      const container = document.getElementById('chot-luong-rows');
      if (container) container.innerHTML = this._renderChotLuongRows();
      this._updateChotLuongTotal();
    }
  },

  _closeChotLuongModal() {
    const existing = document.getElementById('chot-luong-overlay');
    if (existing) existing.remove();
    this._chotLuongState = null;
  },

  async _confirmChotLuong() {
    if (!this._chotLuongState) return;
    if (this._isChotLuongProcessing) return;
    this._isChotLuongProcessing = true;

    const maDon = this._chotLuongState.maDon;

    // AUTO-SAVE: Cố gắng lưu các trường thông thường trên popup trước khi chốt lương
    try {
      console.log(`[DEBUG] Auto-saving card details for ${maDon} before action...`);
      await this._saveCardDetail(maDon);
    } catch (saveErr) {
      console.warn(`[DEBUG] Lỗi auto-save trước khi chốt lương (không block luồng):`, saveErr);
    }

    try {
      const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
      
      const finalData = {};
      let totalLuong = 0;
      this._chotLuongState.rows.forEach(r => {
        if (!r.designer || r.designer.trim() === '') return;
        const name = r.designer.trim();
        const score = parseFloat(r.score.toString().replace(/,/g, '.'));
        if (!isNaN(score) && score > 0) {
          finalData[name] = score;
          totalLuong += score;
        }
      });
      
      // 1. Kiểm tra tổng điểm
      const diemDon = don && don.diem_don !== undefined && don.diem_don !== '' ? parseFloat(don.diem_don) : null;
      if (diemDon !== null && !isNaN(diemDon)) {
        if (totalLuong > diemDon) {
          this._showToast(`Tổng điểm lương (${totalLuong}) không được lớn hơn điểm đơn (${diemDon}). Vui lòng nhập lại.`, 'error');
          console.log(`[DEBUG chot luong] tổng điểm = ${totalLuong}, điểm đơn = ${diemDon}, hợp lệ = false`);
          return; // Stop execution, don't close modal
        }
      }
      console.log(`[DEBUG chot luong] tổng điểm = ${totalLuong}, điểm đơn = ${diemDon}, hợp lệ = true`);
      console.log('[DEBUG chot luong] bấm xác nhận - danh sách:', finalData);

      this._showToast('Đang ghi điểm lương...', 'info');

      // 2. Kiểm tra đơn đã tồn tại trong DIEM_DESIGNER chưa
      const luongRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER);
      const exists = luongRows.some(r => r.ma_don === maDon);
      if (exists) {
        this._showToast(`Đơn ${maDon} đã được chốt lương từ trước. Không thể chốt đè.`, 'error');
        console.log(`[DEBUG chot luong] Đơn ${maDon} đã có trong DIEM_DESIGNER, từ chối ghi.`);
        return;
      }

      // 3. Append vào DIEM_DESIGNER
      const todayStr = new Date().toISOString().substring(0, 10);
      const appendValues = Object.keys(finalData).map(name => [
        maDon,
        name,
        finalData[name],
        "'" + todayStr
      ]);

      if (appendValues.length > 0) {
        await this._appendSheet(CONFIG.SHEETS.DIEM_DESIGNER, appendValues);
        console.log(`[DEBUG chot luong] đã append vào DIEM_DESIGNER:`, appendValues);
      } else {
        console.log(`[DEBUG chot luong] không có dòng điểm nào để ghi vào DIEM_DESIGNER.`);
      }

      // 4. Đặt cờ da_ghi_diem_luong trong DON_HANG (cột W)
      const donHangRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const donRowIdx = donHangRows.findIndex(r => r.ma_don === maDon);
      if (donRowIdx !== -1) {
        const headerRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
          { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
        );
        const headerData = await headerRes.json();
        const headers = (headerData.values || [[]])[0] || [];
        const flagIdx = headers.indexOf('da_ghi_diem_luong');
        if (flagIdx >= 0) {
          const flagLetter = this._colIndexToLetter(flagIdx);
          const sheetRow = donRowIdx + 2; 
          await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${flagLetter}${sheetRow}`, [['yes']]);
          console.log(`[DEBUG chot luong] đã đặt cờ yes cột W cho [mã đơn]: ${maDon} tại ô ${flagLetter}${sheetRow}`);
        } else {
          console.warn(`[DEBUG chot luong] Không tìm thấy cột da_ghi_diem_luong trong header của DON_HANG.`);
        }
      }

      if (don) don.da_ghi_diem_luong = 'yes';
      
      this._showToast('✅ Đã chốt điểm lương thành công!', 'success');
      this._closeChotLuongModal();
      
      const isFromPopup = !!document.getElementById('kb-detail-overlay');
      if (isFromPopup) {
         this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
         this._openCardDetail(maDon);
      }

    } catch (e) {
      console.error(e);
      this._showToast(`Lỗi chốt lương: ${e.message}`, 'error');
    } finally {
      this._isChotLuongProcessing = false;
    }
  },

  async _kanbanUpdateCotKanbanVaThuTu(maDon, newCol, newThuTu) {
    const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
    const idx  = rows.findIndex(r => r.ma_don === maDon);
    if (idx === -1) throw new Error('Không tìm thấy đơn ' + maDon);

    const headerRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
      { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
    );
    const headerData = await headerRes.json();
    const headers = (headerData.values || [[]])[0] || [];
    
    const colIdx = headers.indexOf('cot_kanban');
    const thuTuIdx = headers.indexOf('thu_tu');
    const flagIdx = headers.indexOf('da_ghi_diem_xu_ly');
    
    if (colIdx === -1) throw new Error('Thiếu cột cot_kanban trong Sheets');
    if (thuTuIdx === -1) throw new Error('Thiếu cột thu_tu trong Sheets');

    const colLetter = this._colIndexToLetter(colIdx);
    const thuTuLetter = this._colIndexToLetter(thuTuIdx);
    const sheetRow  = idx + 2;

    const writes = [
      this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${sheetRow}`, [[newCol]]),
      this._writeSheet(CONFIG.SHEETS.DON_HANG, `${thuTuLetter}${sheetRow}`, [[newThuTu]])
    ];

    // ==========================================
    // BƯỚC 2: TỰ ĐỘNG GHI NHẬN ĐIỂM TẠM
    // ==========================================
    if (newCol === 'Gửi khách hàng' || newCol === 'Chờ khách hàng phản hồi') {
      const dbRow = rows[idx];
      const isFlagged = dbRow.da_ghi_diem_xu_ly && dbRow.da_ghi_diem_xu_ly.toString().trim() !== '';
      
      if (!isFlagged && flagIdx !== -1) {
         const todayStr = new Date().toISOString().substring(0, 10);
         
         // Đọc DIEM_XU_LY để chốt ngày ghi nhận
         const rawDiemXuLy = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY).catch(() => []);
         const rowsXuLyForDon = [];
         rawDiemXuLy.forEach((row, i) => {
           if (row.ma_don === maDon) rowsXuLyForDon.push({ ...row, rowIndex: i + 2 });
         });

         // Cập nhật ngày ghi nhận vào DIEM_XU_LY
         rowsXuLyForDon.forEach(r => {
           writes.push(this._writeSheet(CONFIG.SHEETS.DIEM_XU_LY, `D${r.rowIndex}`, [[todayStr]]));
         });

         // Đặt cờ vào DON_HANG
         const flagLetter = this._colIndexToLetter(flagIdx);
         writes.push(this._writeSheet(CONFIG.SHEETS.DON_HANG, `${flagLetter}${sheetRow}`, [[todayStr]]));
         
         // Cập nhật RAM cache
         if (this._kanbanData) {
            const memDon = this._kanbanData.find(d => d.ma_don === maDon);
            if (memDon) memDon.da_ghi_diem_xu_ly = todayStr;
         }
      }
    }

    await Promise.all(writes);
  },

  _colIndexToLetter(idx) {
    let result = '';
    idx = idx + 1;
    while (idx > 0) {
      const rem = (idx - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      idx = Math.floor((idx - 1) / 26);
    }
    return result;
  },

  // ── Card Detail Popup ─────────────────────────────────────────
  _openCardDetail(maDon) {
    const existing = document.getElementById('kb-detail-overlay');
    if (existing) {
      existing.remove();
    }

    const don = this._kanbanData.find(d => d.ma_don === maDon);
    if (!don) return;

    const isDesigner  = this.session?.role === 'designer';
    const isSaleAdmin = !isDesigner; // sale hoặc admin
    const isCancelled = don.trang_thai && don.trang_thai !== 'đang chạy';

    // ── File links ────────────────────────────────────────────
    const linkLines = (don.link_anh || '').split('\n').filter(Boolean);
    const linksHtml = linkLines.length > 0
      ? linkLines.map((url, i) => {
          const parts = url.split('|');
          const fileUrl = parts[0];
          let name = parts.length > 1 ? parts[1] : '';
          if (!name) {
             name = fileUrl.match(/\/([^/]+)\/(view|preview|download)?$/)?.[1] || `File ${i+1}`;
          }
          const isImg = /\.(jpg|jpeg|png|gif|webp|svg)/i.test(fileUrl) || /\.(jpg|jpeg|png|gif|webp|svg)/i.test(name);
          
          let editBtnHtml = '';
          if (isSaleAdmin && parts.length > 1) {
             editBtnHtml = `
               <button class="kb-edit-file-btn" onclick="document.getElementById('edit-file-view-${i}').style.display='none'; document.getElementById('edit-file-input-wrapper-${i}').style.display='flex'; event.preventDefault();" style="background:none; border:none; cursor:pointer; color:#9C7E5E; padding:4px;" title="Sửa tên">✎</button>
             `;
          }

          const viewHtml = `
            <div id="edit-file-view-${i}" style="display:flex; align-items:center; gap:4px; width:100%; margin-bottom:4px;">
              ${isImg
                ? `<a href="${this._escHtml(fileUrl)}" target="_blank" class="kb-detail-file kb-detail-img-link" style="flex:1; margin:0;">
                     <img src="${this._escHtml(fileUrl.replace('view','preview'))}" alt="${i+1}" onerror="this.style.display='none'"/>
                     <span>${this._escHtml(name)}</span>
                   </a>`
                : `<a href="${this._escHtml(fileUrl)}" target="_blank" class="kb-detail-file" style="flex:1; margin:0;">
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                     ${this._escHtml(decodeURIComponent(name))}
                   </a>`
              }
              ${editBtnHtml}
            </div>
          `;

          const editHtml = `
            <div id="edit-file-input-wrapper-${i}" style="display:none; align-items:center; gap:4px; width:100%; padding: 4px 8px; background: #f9f9f9; border-radius: 8px; border: 1px solid #ddd; margin-bottom: 8px;">
              <input type="text" id="edit-file-input-${i}" value="${this._escHtml(name)}" style="flex:1; padding: 4px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px;" />
              <button onclick="App._saveFileName('${maDon}', ${i}, '${this._escHtml(fileUrl)}')" class="btn btn-sm" style="padding:4px 8px;">Lưu</button>
              <button onclick="document.getElementById('edit-file-input-wrapper-${i}').style.display='none'; document.getElementById('edit-file-view-${i}').style.display='flex';" class="btn btn-sm btn-outline" style="padding:4px 8px;">Hủy</button>
            </div>
          `;

          return `<div>${viewHtml}${editHtml}</div>`;
        }).join('')
      : `<p style="color:var(--clr-text-muted);font-size:var(--font-size-sm);">Chưa có file đính kèm.</p>`;

    // ── Dropdowns ────────────────────────────────────────────
    const colOpts = this.KANBAN_COLS.map(c =>
      `<option value="${this._escHtml(c)}"${don.cot_kanban === c ? ' selected' : ''}>${this._escHtml(c)}</option>`
    ).join('');
    const trangThaiOpts = ['đang chạy','hủy-hoàn cọc','hủy-giữ cọc'].map(s =>
      `<option value="${s}"${don.trang_thai === s ? ' selected' : ''}>${s}</option>`
    ).join('');

    // ── Label checkboxes (Trello style) ──────────────────────
    const currentLabels = (this._kanbanLabelMap?.[maDon] || []).map(l => l.nhan);
    const labelsCheckboxHtml = this.LABEL_PRESETS.map(l => {
      const checked = currentLabels.includes(l.nhan) ? ' checked' : '';
      const st = App._getLabelStyle(l.nhan);
      const border = checked ? `2px solid ${st.color}` : `1px solid transparent`;
      return `<label class="kb-label-trello" style="background:${st.bg}; border:${border}; display:flex; align-items:center; justify-content:space-between; padding:6px 16px; border-radius:999px; margin-bottom:8px; cursor:pointer; color:${st.color}; font-weight:700; font-size:12px; user-select:none; transition:all 0.15s;">
        <input type="checkbox" value="${this._escHtml(l.nhan)}" data-mau="${this._escHtml(l.mau)}"${checked} class="kb-label-cb" style="display:none;" onchange="this.parentElement.style.border=this.checked?'2px solid ${st.color}':'1px solid transparent'; this.nextElementSibling.nextElementSibling.style.display=this.checked?'block':'none'"/>
        <span>${this._escHtml(l.nhan)}</span>
        <span class="label-check" style="display:${checked ? 'block' : 'none'};">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
      </label>`;
    }).join('');

    this._detSelectedFiles = [];

    // ── Deadline Datetime ───────────────────────────────────
    const dtIso = this._formatDatetimeLocal(don.ngay_het_han);
    const dmIso = this._formatDatetimeLocal(don.ngay_duyet_mau).substring(0, 10);
    
    const currentCol = (don.cot_kanban || '').trim().toLowerCase();
    const allowedDuyetMauCols = ["cần xuất hoàn thành", "bàn giao khách hàng", "hoàn thành đơn"];
    const showNgayDuyetMau = isSaleAdmin && allowedDuyetMauCols.includes(currentCol);
    console.log(`[DEBUG ngay duyet] cột đơn = ${currentCol}, hiện ô ngày duyệt = ${showNgayDuyetMau}`);

    // ── Ngày lên đơn ────────────────────────────────────────
    let nldIso = '';
    if (don.ngay_len_don) {
      const parts = don.ngay_len_don.split('/');
      if (parts.length === 3) {
        nldIso = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
    const ngayLenDonHtml = `
      <div class="kb-detail-field-group">
        <label class="kb-detail-label">Ngày lên đơn</label>
        <input type="date" class="form-input" id="det-ngay-len-don" value="${nldIso}" style="font-size:var(--font-size-sm);"/>
      </div>
    `;

    const ngayHetHanHtml = `
      <div class="kb-detail-field-group">
        <label class="kb-detail-label">Ngày hết hạn</label>
        <input type="datetime-local" class="form-input" id="det-ngay-het-han" value="${dtIso}" style="font-size:var(--font-size-sm);"/>
      </div>
      ${showNgayDuyetMau ? `
      <div class="kb-detail-field-group">
        <label class="kb-detail-label">Ngày duyệt mẫu</label>
        <input type="date" class="form-input" id="det-ngay-duyet-mau" value="${dmIso}" style="font-size:var(--font-size-sm);"/>
      </div>
      ` : ''}
      ${don.ngay_thu_du ? `
      <div class="kb-detail-field-group">
        <label class="kb-detail-label">Ngày thu đủ</label>
        <input type="text" class="form-input" value="${this._escHtml(don.ngay_thu_du)}" style="font-size:var(--font-size-sm); background: #f0f9f4; color: #27ae60; font-weight: 600; border-color: #27ae60;" disabled title="Ngày đơn đạt trạng thái thu đủ tiền" />
      </div>
      ` : ''}
    `;

    // ── Designers Multi-select ──────────────────────────────
    const isLeaderAdmin = ['admin', 'leader', 'sale'].includes(this.session?.role);

    const assignedDesigners = this._kanbanDesignerMap[maDon] || [];
    const designerScores = this._kanbanDesignerScoreMap?.[maDon] || {};
    const designerTempScores = this._kanbanDiemXuLyMap?.[maDon] || {};
    const designerStaff = (this._nhanSuList || []).filter(n => n.vai_tro === 'designer').map(n => n.ten || n.ho_ten || n.ten_nhan_vien || n.email || '');
    const availableDesigners = designerStaff.filter(d => d && !assignedDesigners.includes(d));

    let designerHtml = '';
    
    if (isSaleAdmin) {
      let totalScore = 0;
      const tagsHtml = assignedDesigners.map(d => {
         const diem = designerScores[d] || '';
         const diemTam = designerTempScores[d] || '';
         const val = parseFloat(diemTam.toString().replace(/,/g, '.'));
         if (!isNaN(val)) totalScore += val;
         
         const removeBtn = isLeaderAdmin ? `<svg onclick="this.parentElement.remove(); App._updateDesignerSelect(); App._calculateTotalScore();" style="cursor:pointer;color:#E74C3C;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>` : '';
         // Bỏ biến scoreTempInput

         return `
            <span class="kb-tag" style="display:inline-flex;align-items:center;gap:4px;background:var(--clr-bg);border:1px solid var(--clr-border);">
              ${this._escHtml(d)}${diem !== '' ? `<span style="font-size:11px; font-weight:700; color:#8D6E63; background:rgba(141,110,99,0.15); padding:2px 6px; border-radius:12px; line-height:1;">${this._escHtml(diem)}P</span>` : ''}
              <input type="hidden" name="assigned_designer" value="${this._escHtml(d)}" />
              ${removeBtn}
            </span>
         `;
      }).join('');

      const targetCols = ["gửi khách hàng", "chờ khách hàng phản hồi"];
      const currentCol = (don.cot_kanban || '').trim().toLowerCase();
      const showChotDiemBtn = targetCols.includes(currentCol);
      console.log(`[DEBUG a3] cột đơn = ${currentCol}, hiện nút chốt = ${showChotDiemBtn}`);

      let chotDiemBtnHtml = '';
      if (showChotDiemBtn) {
        if (don.da_ghi_diem_xu_ly === 'yes') {
          chotDiemBtnHtml = `<button type="button" class="btn btn-sm btn-ghost" style="background:#e0e0e0; color:#888; cursor:not-allowed;" disabled>Đã chốt điểm</button>`;
        } else {
          chotDiemBtnHtml = `<button type="button" class="btn btn-sm btn-primary" data-chot-diem-ma="${this._escHtml(don.ma_don)}" onclick="App._openChotDiemModalFromPopup(this.dataset.chotDiemMa)">Chốt điểm xử lý</button>`;
        }
      }
      
      if (don.da_ghi_diem_xu_ly === 'yes' && this.session?.role === 'admin') {
        chotDiemBtnHtml += ` <button type="button" class="btn btn-sm btn-outline" style="border-color:#3498db; color:#3498db;" onclick="App._openSuaDiemXuLyModal('${this._escHtml(don.ma_don)}')">Sửa lại điểm xử lý</button>`;
      }

      const targetColsLuong = ["cần xuất hoàn thành", "bàn giao khách hàng", "hoàn thành đơn"];
      const showChotLuongBtn = targetColsLuong.includes(currentCol);
      let chotLuongBtnHtml = '';
      if (showChotLuongBtn) {
        chotLuongBtnHtml = don.da_ghi_diem_luong === 'yes'
          ? `<button type="button" class="btn btn-sm btn-ghost" style="background:#e0e0e0; color:#888; cursor:not-allowed;" disabled>Đã chốt lương</button>`
          : `<button type="button" class="btn btn-sm btn-secondary" style="background:#8E44AD; color:#FFF; border-color:#8E44AD;" data-chot-luong-ma="${this._escHtml(don.ma_don)}" onclick="App._openChotLuongModal('${this._escHtml(don.ma_don)}')">Chốt điểm lương</button>`;
      }
      
      if (don.da_ghi_diem_luong === 'yes' && this.session?.role === 'admin') {
        chotLuongBtnHtml += ` <button type="button" class="btn btn-sm btn-outline" style="border-color:#e74c3c; color:#e74c3c;" onclick="App._confirmAndOpenSuaDiemLuongModal('${this._escHtml(don.ma_don)}')">Sửa lại điểm lương</button>`;
      }

      designerHtml = `
        <div class="kb-info-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <span>Designers phụ trách</span>
          <div id="det-designer-tags" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            ${tagsHtml}
          </div>
          ${isLeaderAdmin ? `
          <select class="form-select" id="det-designer-select" style="font-size:12px; padding:4px; width:100%;" onchange="App._onDesignerSelect(this)">
            <option value="">+ Thêm designer...</option>
            ${availableDesigners.map(d => `<option value="${this._escHtml(d)}">${this._escHtml(d)}</option>`).join('')}
          </select>` : ''}
          <div style="font-size:12px; font-weight:600; color:var(--clr-text); margin-top:12px; width:100%;">
            <div style="display:flex; flex-wrap:wrap; gap:8px; width:100%;">
              ${chotDiemBtnHtml}
              ${chotLuongBtnHtml}
            </div>
            <!-- Đã ẩn dòng Tổng điểm vì không còn ô nhập điểm ở đây -->
            <span style="display:none;">Tổng điểm: <span id="det-total-score">${Number(totalScore.toFixed(2))}</span></span>
          </div>
        </div>
      `;
    } else {
      const tagsHtml = assignedDesigners.map(d => {
         const diem = designerScores[d] || '';
         return `
            <span class="kb-tag" style="display:inline-flex;align-items:center;gap:4px;background:var(--clr-bg);border:1px solid var(--clr-border);">
              ${this._escHtml(d)}${diem !== '' ? `<span style="font-size:11px; font-weight:700; color:#8D6E63; background:rgba(141,110,99,0.15); padding:2px 6px; border-radius:12px; line-height:1;">${this._escHtml(diem)}P</span>` : ''}
            </span>
         `;
      }).join('');

      designerHtml = `
        <div class="kb-info-row" style="flex-direction:column; align-items:flex-start; gap:8px;">
          <span>Designers phụ trách</span>
          <div id="det-designer-tags" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            ${tagsHtml}
          </div>
        </div>
      `;
    }

    // ── Brief with clickable links ──────────────────────────
    const briefDisplay = this._linkifyText(don.brief || '');

    // ── Contact info (sale/admin only) ──────────────────────
    const kh = this._kanbanKhachHangMap?.[don.ma_kh] || don;
    const contactHtml = isSaleAdmin ? `
      <div class="kb-detail-section">
        <div class="kb-detail-section-title">Liên hệ</div>
        <div class="kb-detail-info-rows">
          ${(kh.fanpage || kh.facebook) ? `<div class="kb-info-row"><span>Fanpage</span><a href="${(kh.fanpage || kh.facebook).startsWith('http')?this._escHtml(kh.fanpage || kh.facebook):'https://'+this._escHtml(kh.fanpage || kh.facebook)}" target="_blank" style="color:var(--clr-accent);font-weight:600;max-width:60%;word-break:break-all;text-align:right;">${this._escHtml(kh.fanpage || kh.facebook)}</a></div>` : ''}
          ${kh.zalo  ? `<div class="kb-info-row"><span>Zalo</span><strong>${this._escHtml(kh.zalo)}</strong></div>` : ''}
          ${kh.sdt   ? `<div class="kb-info-row"><span>SĐT</span><strong>${this._escHtml(kh.sdt)}</strong></div>` : ''}
          ${!kh.fanpage && !kh.facebook && !kh.zalo && !kh.sdt ? '<div style="font-size:11px;color:var(--clr-text-muted);">Chưa có thông tin liên hệ.</div>' : ''}
        </div>
      </div>` : '';

    // ── Finance section (sale/admin only) ──────────────────
    const giaoDichList = (this._giaoDichTienList || []).filter(g => g.ma_don === maDon);
    let daThucThu = 0;
    let tongTip = 0;
    giaoDichList.forEach(g => {
       const tien = App._parseCurrency(g.so_tien);
       if (!isNaN(tien)) {
          daThucThu += tien;
          if ((g.loai || '').toLowerCase() === 'tip') tongTip += tien;
       }
    });
    
    const tongGiaTri = App._parseCurrency(don.tong_gia_tri);
    const soPhaiThu = App._tinhSoPhaiThu(don);
    let conNo = soPhaiThu - daThucThu;
    let conNoHtml = '';
    
    if (conNo <= 0) {
       conNoHtml = `<div class="kb-detail-field-group">
            <label class="kb-detail-label">Còn nợ</label>
            <div style="font-size:16px; color:#3B7A57; font-weight:800; padding:8px 12px; background:#E8F5E9; border-radius:6px;">
               0 ₫
               ${tongTip > 0 ? `<div style="font-size:11px; color:#2E7D32; margin-top:4px; font-weight:600;">Đã tip: ${tongTip.toLocaleString('vi-VN')} ₫</div>` : ''}
            </div>
          </div>`;
       conNo = 0;
    } else {
       conNoHtml = `<div class="kb-detail-field-group">
            <label class="kb-detail-label">Còn nợ</label>
            <div style="font-size:16px; color:#B4453C; font-weight:800; padding:8px 12px; background:#FCE9E9; border-radius:6px;">
               ${conNo.toLocaleString('vi-VN')} ₫
            </div>
          </div>`;
    }
    
    const isCancelledStatus = don.trang_thai && don.trang_thai.toLowerCase().startsWith('hủy');
    const thuTienDisabled = isCancelledStatus ? 'disabled style="opacity:0.5; cursor:not-allowed;" title="Đơn đã hủy, không thể thu thêm"' : '';

    const financeHtml = isSaleAdmin ? `
      <div class="kb-detail-section">
        <div class="kb-detail-section-title">Tài chính</div>
        <div class="kb-detail-grid">
          <div class="kb-detail-field-group">
            <label class="kb-detail-label">Tổng giá trị</label>
            <div style="display:flex; gap:8px;">
              <input type="text" class="form-input" id="det-tong-gia-tri-display" value="${tongGiaTri > 0 ? tongGiaTri.toLocaleString('en-US') : ''}" placeholder="0" oninput="App._formatMoneyInput(this, 'det-tong-gia-tri-hidden'); App._updateGiamGiaPreview();" onblur="App._formatMoneyInput(this, 'det-tong-gia-tri-hidden'); App._updateGiamGiaPreview();" style="font-size:var(--font-size-sm); flex: 1;"/>
              <input type="hidden" id="det-tong-gia-tri-hidden" value="${tongGiaTri}"/>
              <button class="btn btn-primary" onclick="App._confirmSuaTongGiaTri('${this._escHtml(don.ma_don)}')" style="white-space: nowrap;">Lưu</button>
            </div>
          </div>
          
          <div class="kb-detail-field-group" style="grid-column: 1 / -1;">
             <label class="kb-detail-label">Giảm giá</label>
             <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-start;">
                ${(() => {
                   const giamGiaLoai = (don.giam_gia_loai || '').trim();
                   return `
                   <select id="det-giam-gia-loai" class="form-input" style="flex: 1; min-width: 120px;" onchange="App._formatGiamGiaInput(document.getElementById('det-giam-gia-gia-tri'))">
                      <option value="" ${!giamGiaLoai ? 'selected' : ''}>Không giảm</option>
                      <option value="percent" ${giamGiaLoai === 'percent' ? 'selected' : ''}>Giảm theo %</option>
                      <option value="amount" ${giamGiaLoai === 'amount' ? 'selected' : ''}>Giảm số tiền (VNĐ)</option>
                   </select>
                   <div style="flex: 1; min-width: 140px; position:relative;">
                      <input type="text" id="det-giam-gia-gia-tri" class="form-input" placeholder="Nhập số..." value="${giamGiaLoai === 'percent' ? (don.giam_gia_gia_tri || '') : (don.giam_gia_gia_tri ? Number(don.giam_gia_gia_tri).toLocaleString('en-US') : '')}" oninput="App._formatGiamGiaInput(this)" onblur="App._formatGiamGiaInput(this)" style="font-size:var(--font-size-sm);" ${!giamGiaLoai ? 'disabled' : ''}/>
                      <input type="hidden" id="det-giam-gia-gia-tri-hidden" value="${don.giam_gia_gia_tri || ''}" />
                   </div>
                   `;
                })()}
             </div>
             <div id="det-giam-gia-preview" style="font-size: 13px; font-weight: 600; color: #E67E22; margin-top: 8px;">
                ${(don.giam_gia_loai || '').trim() ? `Số tiền giảm: ${this._tinhSoTienGiam(don).toLocaleString('vi-VN')} ₫ &nbsp;|&nbsp; Số phải thu: <span style="color:var(--clr-success);">${this._tinhSoPhaiThu(don).toLocaleString('vi-VN')} ₫</span>` : ''}
             </div>
          </div>

          ${this._detailField('Đã thực thu', daThucThu.toLocaleString('vi-VN') + ' ₫', null, true)}
          ${conNoHtml}
        </div>
        
        ${giaoDichList.length > 0 ? `
        <div style="margin-top:12px; font-size:12px; border:1px solid var(--clr-border); border-radius:4px; overflow:hidden;">
           <div style="background:rgba(0,0,0,0.03); padding:6px 8px; font-weight:600; border-bottom:1px solid var(--clr-border);">Lịch sử giao dịch</div>
           <div style="padding:4px 8px;">
           ${giaoDichList.map(g => {
             const rawDate = g.ngay || '';
             let isoDate = '';
             if (rawDate) {
               const parts = rawDate.split('/');
               if (parts.length === 3) isoDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
             }
             const idGiaoDich = this._escHtml(g.id_giao_dich || '');
             const maDonSafe = this._escHtml(maDon);
             const rawSoTien = Number((g.so_tien || '').toString().replace(/[^0-9.-]/g, '') || 0);
             
             const isAdmin = this.session?.role === 'admin';
             const isAllowedLoai = !['tip', 'hoàn cọc'].includes((g.loai || '').toLowerCase());
             const canEditAmount = isAdmin && idGiaoDich !== '' && rawSoTien > 0 && isAllowedLoai;
             const canDelete = isAdmin && idGiaoDich !== '';
             
             return `
              <div id="gd-view-${idGiaoDich}" style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px dashed var(--clr-border); align-items:center;">
                <span style="display:flex; align-items:center; gap:4px;">
                  ${this._escHtml(g.ngay || '')} 
                  <span style="color:var(--clr-text-muted);">(${this._escHtml(g.loai || '')})</span>
                  ${isSaleAdmin && idGiaoDich !== '' ? `
                    <button class="btn btn-ghost btn-sm" style="padding:2px 6px; height:auto; min-height:0; color:var(--clr-primary);" onclick="document.getElementById('gd-view-${idGiaoDich}').style.display='none'; document.getElementById('gd-edit-${idGiaoDich}').style.display='flex';" title="Sửa ngày">✎</button>
                  ` : ''}
                </span>
                <strong style="text-align:right; font-weight:600; font-size:13px; color:var(--clr-text); display:flex; align-items:center; gap:4px;">
                  ${rawSoTien.toLocaleString('vi-VN')} ₫
                  ${canEditAmount ? `
                    <button class="btn btn-ghost btn-sm" style="padding:2px 6px; height:auto; min-height:0; color:var(--clr-primary);" onclick="document.getElementById('gd-view-${idGiaoDich}').style.display='none'; document.getElementById('gd-edit-amount-${idGiaoDich}').style.display='flex';" title="Sửa tiền">✎</button>
                  ` : ''}
                  ${canDelete ? `
                    <button class="btn btn-ghost btn-sm" style="padding:2px 6px; height:auto; min-height:0; color:#e74c3c; opacity:0.8;" onclick="App._xoaGiaoDich('${idGiaoDich}', '${maDonSafe}')" title="Xóa giao dịch">🗑</button>
                  ` : ''}
                </strong>
              </div>
              
              ${isSaleAdmin && idGiaoDich !== '' ? `
              <div id="gd-edit-${idGiaoDich}" style="display:none; justify-content:space-between; padding:4px 0; border-bottom:1px dashed var(--clr-border); align-items:center; background:#f9f9f9;">
                <div style="display:flex; gap:4px; align-items:center;">
                  <input type="date" id="gd-input-${idGiaoDich}" value="${isoDate}" class="form-input" style="font-size:12px; padding:2px 4px; height:auto;" />
                  <button class="btn btn-primary btn-sm" style="padding:2px 6px; height:auto; min-height:0;" onclick="App._saveGiaoDichDate('${maDonSafe}', '${idGiaoDich}')">Lưu</button>
                  <button class="btn btn-ghost btn-sm" style="padding:2px 6px; height:auto; min-height:0;" onclick="document.getElementById('gd-edit-${idGiaoDich}').style.display='none'; document.getElementById('gd-view-${idGiaoDich}').style.display='flex';">Hủy</button>
                </div>
                <strong style="text-align:right; font-weight:600; font-size:13px; color:var(--clr-text); opacity:0.5;">${rawSoTien.toLocaleString('vi-VN')} ₫</strong>
              </div>
              ` : ''}
              
              ${canEditAmount ? `
              <div id="gd-edit-amount-${idGiaoDich}" style="display:none; justify-content:space-between; padding:4px 0; border-bottom:1px dashed var(--clr-border); align-items:center; background:#f9f9f9;">
                <span style="opacity:0.5; font-size:12px;">${this._escHtml(g.ngay || '')}</span>
                <div style="display:flex; gap:4px; align-items:center;">
                  <input type="text" id="gd-input-amount-${idGiaoDich}" value="${rawSoTien.toLocaleString('vi-VN')}" class="form-input" style="font-size:12px; padding:2px 4px; height:auto; width:90px; text-align:right;" oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')" />
                  <span style="font-size:12px; margin-right:4px;">₫</span>
                  <button class="btn btn-primary btn-sm" style="padding:2px 6px; height:auto; min-height:0;" onclick="App._saveGiaoDichAmount('${maDonSafe}', '${idGiaoDich}')">Lưu</button>
                  <button class="btn btn-ghost btn-sm" style="padding:2px 6px; height:auto; min-height:0;" onclick="document.getElementById('gd-edit-amount-${idGiaoDich}').style.display='none'; document.getElementById('gd-view-${idGiaoDich}').style.display='flex';">Hủy</button>
                </div>
              </div>
              ` : ''}
           `}).join('')}
           </div>
        </div>
        ` : ''}
        
        <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px; align-items:flex-end;">
          <button class="btn btn-sm" onclick="App._openThuTienForm(${conNo})" ${thuTienDisabled}>Thu thêm tiền</button>
          <div id="det-thu-tien-form" style="display:none; flex-direction:column; gap:8px; width:100%; align-items:flex-end; background:var(--clr-bg); padding:12px; border:1px solid var(--clr-border); border-radius:4px;">
             <div style="display:flex; gap:8px; width:100%;">
                <select id="det-thu-loai" class="form-select" style="font-size:13px; padding:6px; flex:1;" onchange="if(this.value === 'thu nốt' && document.getElementById('det-thu-tien-input').dataset.conno > 0) document.getElementById('det-thu-tien-input').value = Number(document.getElementById('det-thu-tien-input').dataset.conno).toLocaleString('vi-VN')">
                   <option value="cọc">Cọc</option>
                   <option value="thu nốt" selected>Thu nốt</option>
                   <option value="thu thêm">Thu thêm</option>
                </select>
                <input type="text" id="det-thu-tien-input" class="form-input" placeholder="Số tiền (VNĐ)..." style="font-size:13px; padding:6px; flex:2;" oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')" />
             </div>
             <div style="display:flex; gap:8px; margin-top:4px;">
                <button class="btn btn-ghost btn-sm" onclick="document.getElementById('det-thu-tien-form').style.display='none'; document.getElementById('det-thu-tien-form').previousElementSibling.style.display='block';">Hủy</button>
                <button class="btn btn-primary btn-sm" onclick="App._submitThuTien('${this._escHtml(maDon)}')">Xác nhận thu</button>
             </div>
          </div>
        </div>
      </div>` : '';
    const huyDonBtn = (isSaleAdmin && !isCancelledStatus) ? `
      <div style="margin-top:12px; display:flex; flex-direction:column; gap:8px; align-items:flex-end; border-top:1px dashed rgba(231,76,60,0.5); padding-top:12px;">
        <button class="btn btn-sm" style="background:rgba(231,76,60,0.1); color:var(--clr-error); border-color:var(--clr-error);" onclick="document.getElementById('det-huy-don-form').style.display='flex'; this.style.display='none';">Hủy đơn</button>
        <div id="det-huy-don-form" style="display:none; flex-direction:column; gap:8px; width:100%; background:var(--clr-bg); padding:12px; border:1px solid var(--clr-error); border-radius:4px;">
           <div style="font-weight:bold; color:var(--clr-error); font-size:13px; margin-bottom:4px;">XÁC NHẬN HỦY ĐƠN</div>
           
           <label style="font-size:12px; display:flex; align-items:center; gap:6px;">
             <input type="radio" name="huy_loai" id="det-huy-loai-A" value="A" checked onchange="document.getElementById('det-huy-hoan-tien-wrapper').style.display='none'; document.getElementById('det-huy-hoan-tien').value='';" />
             Hủy - Hoàn cọc 100% (Doanh thu về 0)
           </label>
           
           <label style="font-size:12px; display:flex; align-items:flex-start; gap:6px; margin-top:4px;">
             <input type="radio" name="huy_loai" id="det-huy-loai-B" value="B" onchange="document.getElementById('det-huy-hoan-tien-wrapper').style.display='flex';" />
             <div style="display:flex; flex-direction:column; width:100%;">
                <span>Hủy - Giữ cọc (hoặc hoàn một phần)</span>
                <div id="det-huy-hoan-tien-wrapper" style="display:none; align-items:center; gap:6px; margin-top:4px; width:100%;">
                   <span style="font-size:11px; color:var(--clr-text-muted);">Số tiền hoàn lại:</span>
                   <input type="text" id="det-huy-hoan-tien" class="form-input" style="font-size:12px; padding:4px; flex:1;" placeholder="0" oninput="this.value = this.value.replace(/[^0-9]/g, '').replace(/\\B(?=(\\d{3})+(?!\\d))/g, ',')" />
                   <span style="font-size:11px; color:var(--clr-text-muted); cursor:pointer; font-weight:600; padding:2px 4px; background:rgba(0,0,0,0.05); border-radius:2px;" onclick="document.getElementById('det-huy-hoan-tien').value='${daThucThu.toLocaleString('vi-VN')}';">Tối đa</span>
                </div>
             </div>
           </label>
           
           <input type="text" id="det-huy-ly-do" class="form-input" placeholder="Lý do hủy (không bắt buộc)..." style="font-size:12px; padding:6px; margin-top:8px;" />
           
           <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:8px;">
              <button class="btn btn-ghost btn-sm" onclick="document.getElementById('det-huy-don-form').style.display='none'; document.getElementById('det-huy-don-form').previousElementSibling.style.display='block';">Quay lại</button>
              <button class="btn btn-sm" style="background:#c0392b !important; color:#ffffff !important; border:none; font-weight:bold; padding:4px 12px; opacity:1;" onclick="App._submitHuyDon('${this._escHtml(maDon)}', ${daThucThu})">Xác nhận hủy</button>
           </div>
        </div>
      </div>
    ` : '';

    // ── Status section (sale/admin only) ────────────────────
    const statusHtml = isSaleAdmin ? `
      <div class="kb-detail-section">
        <div class="kb-detail-section-title">Tiến độ &amp; Trạng thái</div>
        <div class="kb-detail-grid">
          <div class="kb-detail-field-group">
            <label class="kb-detail-label">Cột Kanban <span style="font-size:10px; font-weight:normal; color:#E74C3C; margin-left:4px;">(Kéo thẻ để đổi)</span></label>
            <select class="form-select" id="det-cot-kanban" style="font-size:var(--font-size-sm); background-color: rgba(0,0,0,0.03); cursor: not-allowed;" disabled title="Chỉ được kéo thả thẻ bên ngoài bảng Kanban để đổi cột">${colOpts}</select>
          </div>
          <div class="kb-detail-field-group">
            <label class="kb-detail-label">Trạng thái</label>
            <div style="font-size:var(--font-size-sm); padding:6px 12px; background:var(--clr-bg); border:1px solid var(--clr-border); border-radius:4px; font-weight:600; color:var(--clr-text);">
              ${(don.trang_thai && don.trang_thai.toLowerCase().startsWith('hủy')) ? 'Đã hủy' : (don.cot_kanban === 'Hoàn thành đơn' && soPhaiThu > 0 && daThucThu >= soPhaiThu ? 'Hoàn thành' : 'Đang chạy')}
            </div>
          </div>
        </div>
        ${huyDonBtn}
      </div>` : `
      <div class="kb-detail-section">
        <div class="kb-detail-section-title">Tiến độ</div>
        <div class="kb-detail-info-rows">
          <div class="kb-info-row"><span>Cột</span><strong>${this._escHtml(don.cot_kanban||'—')}</strong></div>
        </div>
      </div>`;

    const maKhClean = (don.ma_kh || '').replace(/-/g, '');
    const tenGroupZalo = `${maKhClean} - ${don.ten_khach || ''}`;
    const zaloGroupHtml = isSaleAdmin ? `
      <div class="kb-info-row">
        <span>Tên group Zalo</span>
        <div style="display:flex; align-items:center; gap:8px; justify-content:flex-end; max-width: 60%;">
          <strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${this._escHtml(tenGroupZalo)}">${this._escHtml(tenGroupZalo)}</strong>
          <button type="button" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:12px; background:#EDE4D6; color:#9C7E5E; border:none; cursor:pointer; flex-shrink:0; display:inline-flex; align-items:center; gap:4px;" onclick="navigator.clipboard.writeText('${this._escHtml(tenGroupZalo)}'); const t=this; const orig=t.innerHTML; t.innerHTML='Đã copy'; setTimeout(()=>t.innerHTML=orig, 2000);">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            Copy
          </button>
        </div>
      </div>
    ` : '';

    const overlay = document.createElement('div');
    overlay.id = 'kb-detail-overlay';
    overlay.className = 'kb-overlay';

    // ── Comments ────────────────────────────────────────────
    const donComments = (this._commentList || []).filter(c => c.ma_don === maDon);
    let commentsHtml = donComments.map(c => `
      <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--clr-border);">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
          <strong style="font-size:12px; color:var(--clr-text);">${this._escHtml(c.nguoi || 'Ẩn danh')}</strong>
          <span style="font-size:10px; color:var(--clr-text-muted);">${this._escHtml(c.thoi_gian || '')}</span>
        </div>
        <div style="font-size:12px; white-space:pre-wrap; line-height:1.4;">${this._linkifyText(c.noi_dung || '')}</div>
      </div>
    `).join('');

    if (donComments.length === 0) {
      commentsHtml = `<div style="font-size:11px; color:var(--clr-text-muted); font-style:italic;">Chưa có trao đổi nào.</div>`;
    }

    const commentSection = `
      <div class="kb-detail-section" style="margin-top:16px;">
        <div class="kb-detail-section-title">Trao đổi</div>
        <div id="det-comment-list" style="max-height:250px; overflow-y:auto; padding-right:4px; margin-bottom:8px;">
          ${commentsHtml}
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <textarea id="det-comment-input" class="form-textarea" rows="2" placeholder="Nhập bình luận..." style="font-size:12px;"></textarea>
          <button class="btn btn-primary btn-sm" style="align-self:flex-end;" onclick="App._submitComment('${this._escHtml(maDon)}')">Gửi</button>
        </div>
      </div>
    `;

    const hideDonBtnHtml = (this.session?.role === 'admin' && don.da_an !== 'yes')
      ? `<button type="button" class="btn btn-ghost" style="color:#e74c3c; padding:8px 16px;" onclick="App._confirmAndHideOrder('${this._escHtml(maDon)}')">Ẩn đơn</button>`
      : '';

    const deleteDonBtnHtml = (this.session?.role === 'admin')
      ? `<button type="button" class="btn btn-primary" style="background:#c0392b; border:none; padding:8px 16px;" onclick="App._confirmAndDeleteOrder('${this._escHtml(maDon)}')">Xóa đơn</button>`
      : '';

    const adminActionsHtml = (this.session?.role === 'admin')
      ? `<div style="margin-right:auto; display:flex; gap:8px; align-items:center;">${deleteDonBtnHtml}${hideDonBtnHtml}</div>`
      : `<div style="margin-right:auto;"></div>`;

    const maGoc = don.don_cha ? don.don_cha : don.ma_don;
    const hasChildren = (this._danhSachDon || []).some(d => d.don_cha === don.ma_don);
    const hasGroup = don.don_cha || hasChildren;
    const btnXemNhomHtml = hasGroup ? `<button class="btn btn-sm btn-ghost" style="margin-top:6px; background:rgba(156,126,94,0.1); color:#9C7E5E; font-weight:600; padding:4px 10px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; font-size:12px;" onclick="App._openModalNhomDuAn('${this._escHtml(maGoc)}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> Xem nhóm dự án</button>` : '';

    overlay.innerHTML = `
      <div class="kb-detail-modal" id="kb-detail-modal">
        <div class="kb-detail-header">
          <div>
            <div class="kb-detail-id">${this._escHtml(maDon)}
              ${isCancelled ? `<span class="kb-tag kb-tag-cancel">${this._escHtml(don.trang_thai)}</span>` : ''}
            </div>
            <div class="kb-detail-khach">${this._escHtml(don.ten_khach || '')}${don.brand ? ' · ' + this._escHtml(don.brand) : ''}</div>
            ${btnXemNhomHtml}
          </div>
          <button class="kb-detail-close" onclick="App._closeCardDetail()">✕</button>
        </div>

        <div class="kb-detail-body">
          <!-- Cột trái -->
          <div class="kb-detail-left">
            <div style="margin-bottom: 24px;">
              <div style="display:flex;justify-content:space-between;align-items:center; color:#9C7E5E; font-weight:700; font-size:14px; margin-bottom:8px; padding-left:4px;">
                <div style="display:flex; align-items:center; gap:6px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                  BRIEF MÔ TẢ
                </div>
                ${!isDesigner ? `<button class="btn btn-ghost btn-sm" style="padding:4px 12px; height:auto; min-height:0; border-radius:12px; background:rgba(156,126,94,0.1); color:#9C7E5E; font-weight:600;" onclick="this.parentElement.nextElementSibling.style.display='none'; this.parentElement.parentElement.querySelector('#det-brief').style.display='block'; this.parentElement.parentElement.querySelector('#det-brief-upload-wrapper').style.display='block'; this.style.display='none';">Sửa</button>` : ''}
              </div>
              <div class="kb-brief-display" style="white-space:pre-wrap; font-size:14px; line-height:1.6; color:#2A2420; background:#FFFFFF; border:1px solid #EDE4D6; border-radius:10px; padding:16px;">${briefDisplay}</div>
              ${!isDesigner ? `
                <textarea class="form-textarea" id="det-brief" rows="6" style="font-size:var(--font-size-sm); display:none; border-radius:10px; border-color:#EDE4D6;">${this._escHtml(don.brief || '')}</textarea>
                <div id="det-brief-upload-wrapper" style="display:none; margin-top: 8px;">
                  <label class="btn btn-outline btn-sm" for="det-file-upload" style="cursor:pointer; display:inline-flex; width:auto; padding:4px 12px; margin-bottom: 4px; border-radius:8px; border-color:#EDE4D6; color:#9C7E5E;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Tải file bổ sung
                  </label>
                  <input type="file" id="det-file-upload" multiple style="display:none;" onchange="App._onDetFileSelect(event)">
                  <div id="det-file-list" style="font-size:12px; color:var(--clr-text-muted);"></div>
                </div>
              ` : ''}
            </div>

            <div class="kb-detail-section">
              <div class="kb-detail-section-title">Thông tin đơn</div>
              <div class="kb-detail-grid">
                ${this._detailField('Item', don.item, 'det-item')}
                ${isSaleAdmin ? this._detailField('Sale phụ trách', don.sale_phu_trach, 'det-sale') : ''}
                ${isSaleAdmin ? this._detailField('Điểm đơn', don.diem_don, 'det-diem-don') : ''}
                ${ngayLenDonHtml}
                ${ngayHetHanHtml}
              </div>
            </div>

            ${statusHtml}
            ${financeHtml}

            <details style="margin-bottom: 16px;">
              <summary style="background:#F5EFE6; padding:12px 16px; border-radius:10px; font-weight:700; color:#9C7E5E; font-size:13px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; user-select:none;">
                THÔNG TIN KHÁCH HÀNG 
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kb-collapse-icon" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </summary>
              <div style="margin-top:12px;">
                <div class="kb-detail-grid">
                  ${this._detailField('Tên khách', don.ten_khach, 'det-ten-khach')}
                  ${this._detailField('Brand', don.brand, 'det-brand')}
                  ${this._detailField('Ngành', don.nganh, 'det-nganh')}
                </div>
              </div>
            </details>
            
            <details style="margin-bottom: 16px;">
              <summary style="background:#F5EFE6; padding:12px 16px; border-radius:10px; font-weight:700; color:#9C7E5E; font-size:13px; cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; user-select:none;">
                NHÃN ƯU TIÊN
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="kb-collapse-icon" style="transition:transform 0.2s;"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </summary>
              <div style="margin-top:12px;">
                <div class="kb-label-checks">${labelsCheckboxHtml}</div>
              </div>
            </details>
          </div>

          <!-- Cột phải -->
          <div class="kb-detail-right">
            <div class="kb-detail-section">
              <div class="kb-detail-section-title">File đính kèm (${linkLines.length})</div>
              <div class="kb-detail-files">${linksHtml}</div>
            </div>

            <div class="kb-detail-section">
              <div class="kb-detail-section-title">Thông tin thêm</div>
              <div class="kb-detail-info-rows">
                <div class="kb-info-row" style="background:#F5EFE6; padding:8px 12px; border-radius:6px; margin-bottom:8px; border: 1px solid #E2D5C4;">
                   <span style="font-weight:600; color:#876B4D;">Điểm đơn:</span>
                   <strong style="font-size:20px; color:#9C7E5E;">${don.diem_don !== undefined && don.diem_don !== '' ? this._escHtml(don.diem_don) : '—'}</strong>
                </div>
                <div class="kb-info-row"><span>Mã KH</span><strong>${this._escHtml(don.ma_kh||'—')}</strong></div>
                ${zaloGroupHtml}
                <div class="kb-info-row"><span>Đơn cha</span><strong>${this._escHtml(don.don_cha||'—')}</strong></div>
                ${designerHtml}
              </div>
            </div>

            ${contactHtml}
            ${commentSection}
          </div>
        </div>

        <div class="kb-detail-footer">
          ${adminActionsHtml}
          <button class="btn btn-ghost" onclick="App._closeCardDetail()">Đóng</button>
          <button class="btn btn-primary" id="btn-save-detail" onclick="App._saveCardDetail('${this._escHtml(maDon)}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Lưu thay đổi
          </button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) this._closeCardDetail(); });
    requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));
  },

  _detailField(label, value, id, readOnly = false) {
    if (readOnly) {
      return `<div class="kb-detail-field-group">
        <label class="kb-detail-label">${label}</label>
        <div class="kb-detail-value">${this._escHtml(value || '—')}</div>
      </div>`;
    }
    return `<div class="kb-detail-field-group">
      <label class="kb-detail-label">${label}</label>
      <input class="form-input" id="${id}" value="${this._escHtml(value || '')}" style="font-size:var(--font-size-sm);"/>
    </div>`;
  },

  _linkifyText(text) {
    if (!text) return '';
    const escaped = this._escHtml(text);
    // Chuyển URL thành link bấm được
    return escaped.replace(/(https?:\/\/[^\s<"]+)/g,
      url => `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--clr-accent);text-decoration:underline;word-break:break-all;">${url}</a>`
    ).replace(/\n/g, '<br/>');
  },

  _closeCardDetail() {
    const overlay = document.getElementById('kb-detail-overlay');
    if (!overlay) return;
    overlay.classList.remove('kb-overlay-visible');
    setTimeout(() => {
      overlay.remove();
      if (this._popupReturnScreen) {
        const returnScreen = this._popupReturnScreen;
        this._popupReturnScreen = null;
        this.navigateTo(returnScreen);
      }
    }, 250);
  },

  async _submitComment(maDon) {
    const input = document.getElementById('det-comment-input');
    const btn = input.nextElementSibling;
    const noiDung = input.value.trim();
    if (!noiDung) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Đang gửi...';

    try {
      const email = this.session?.email;
      let nguoi = email;
      if (this._nhanSuList) {
        const ns = this._nhanSuList.find(n => n.email === email);
        if (ns && (ns.ho_ten || ns.ten_nhan_vien || ns.ten || ns.ten_designer || ns.designer)) {
           nguoi = ns.ho_ten || ns.ten_nhan_vien || ns.ten || ns.ten_designer || ns.designer;
        }
      }
      
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const thoiGian = `${dd}/${mm}/${yy} ${hh}:${min}`;

      await this._appendSheet(CONFIG.SHEETS.COMMENT, [[ maDon, nguoi, thoiGian, noiDung ]]);

      const newComment = { ma_don: maDon, nguoi, thoi_gian: thoiGian, noi_dung: noiDung };
      if (!this._commentList) this._commentList = [];
      this._commentList.push(newComment);

      const listDiv = document.getElementById('det-comment-list');
      if (listDiv) {
        if (listDiv.innerHTML.includes('Chưa có trao đổi nào')) listDiv.innerHTML = '';
        listDiv.innerHTML += `
          <div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid var(--clr-border);">
            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:4px;">
              <strong style="font-size:12px; color:var(--clr-text);">${this._escHtml(nguoi)}</strong>
              <span style="font-size:10px; color:var(--clr-text-muted);">${this._escHtml(thoiGian)}</span>
            </div>
            <div style="font-size:12px; white-space:pre-wrap; line-height:1.4;">${this._linkifyText(noiDung)}</div>
          </div>
        `;
        listDiv.scrollTop = listDiv.scrollHeight;
      }
      input.value = '';
    } catch (e) {
      this._showToast('Lỗi gửi comment: ' + e.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Gửi';
    }
  },

  _openThuTienForm(conNo) {
    document.getElementById('det-thu-tien-form').style.display='flex';
    document.getElementById('det-thu-tien-form').previousElementSibling.style.display='none';
    const sel = document.getElementById('det-thu-loai');
    const inp = document.getElementById('det-thu-tien-input');
    inp.dataset.conno = conNo;
    if (sel.value === 'thu nốt' && conNo > 0) {
      inp.value = Number(conNo).toLocaleString('vi-VN');
    }
  },

  // ── Card Detail Popup ─────────────────────────────────────────
  _openModalNhomDuAn(maGoc) {
    if (!maGoc) return;
    
    const allList = this._danhSachDon || [];
    const groupOrders = allList.filter(d => (d.ma_don === maGoc || d.don_cha === maGoc) && d.da_an !== 'yes');
    
    if (groupOrders.length === 0) return;
    
    groupOrders.sort((a, b) => {
       if (a.ma_don === maGoc) return -1;
       if (b.ma_don === maGoc) return 1;
       return a.ma_don.localeCompare(b.ma_don);
    });

    const tenKhach = groupOrders[0].ten_khach || '';
    
    const existing = document.getElementById('kb-group-overlay');
    if (existing) existing.remove();
    
    let tableHtml = '';
    if (groupOrders.length === 1) {
       tableHtml = `<div style="font-size:14px; color:var(--clr-text-muted); padding:16px; text-align:center; background:var(--clr-bg); border-radius:8px;">Đơn này chưa thuộc nhóm dự án nào (đơn độc lập).</div>`;
    } else {
       const rowsHtml = groupOrders.map(d => {
          const isGoc = d.ma_don === maGoc;
          const dRich = (this._kanbanData || []).find(k => k.ma_don === d.ma_don) || d;
          const gdListGrp = (this._giaoDichTienList || []).filter(g => g.ma_don === d.ma_don);
          let daThucThuGrp = 0;
          gdListGrp.forEach(g => { const t = App._parseCurrency(g.so_tien); if (!isNaN(t)) daThucThuGrp += t; });
          const soPhaiThuGrp = App._tinhSoPhaiThu(dRich);
          const isThuDuGrp = soPhaiThuGrp > 0 && daThucThuGrp >= soPhaiThuGrp;
          const isHuyGrp = !!(dRich.trang_thai && dRich.trang_thai.toLowerCase().startsWith('h\u1ee7y'));
          let dynStatusGrp = '\u0110ang ch\u1ea1y', stBgGrp = '#EDE6DA', stColorGrp = '#876B4D';
          if (isHuyGrp) { dynStatusGrp = '\u0110\u00e3 h\u1ee7y'; stBgGrp = '#FCE9E9'; stColorGrp = '#B4453C'; }
          else if (dRich.cot_kanban === 'Ho\u00e0n th\u00e0nh \u0111\u01a1n' && isThuDuGrp) { dynStatusGrp = 'Ho\u00e0n th\u00e0nh'; stBgGrp = '#E6F4EA'; stColorGrp = '#3B7A57'; }
          const bg = isGoc ? '#F5EFE6' : '#FFFFFF';
          const badge = isGoc ? `<span style="font-size:10px; font-weight:700; color:#9C7E5E; background:rgba(156,126,94,0.1); padding:2px 6px; border-radius:4px; margin-left:6px; display:inline-block;">ĐƠN GỐC</span>` : '';
          return `
            <tr style="background:${bg}; border-bottom:1px solid var(--clr-border-light); cursor:pointer; transition: background 0.2s;" onmouseover="this.style.background='var(--clr-hover)'" onmouseout="this.style.background='${bg}'" onclick="document.getElementById('kb-group-overlay').remove(); App._openCardDetail('${this._escHtml(d.ma_don)}');">
              <td style="padding:12px; font-weight:600; color:var(--clr-text);">${this._escHtml(d.ma_don)}${badge}</td>
              <td style="padding:12px; color:var(--clr-text); max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${this._escHtml(d.item || '')}</td>
              <td style="padding:12px; color:var(--clr-text-muted);">${this._escHtml(d.ngay_len_don || '')}</td>
              <td style="padding:12px;"><span style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:999px; background:${stBgGrp}; color:${stColorGrp}; white-space:nowrap;">${dynStatusGrp}</span></td>
            </tr>
          `;
       }).join('');
       
       tableHtml = `
         <div style="overflow-x:auto;">
           <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
             <thead>
               <tr style="border-bottom:2px solid var(--clr-border); color:var(--clr-text-muted); font-weight:600;">
                 <th style="padding:12px;">Mã đơn</th>
                 <th style="padding:12px;">Item</th>
                 <th style="padding:12px;">Ngày lên đơn</th>
                 <th style="padding:12px;">Trạng thái</th>
               </tr>
             </thead>
             <tbody>${rowsHtml}</tbody>
           </table>
         </div>
       `;
    }

    const overlay = document.createElement('div');
    overlay.id = 'kb-group-overlay';
    overlay.className = 'kb-overlay';
    
    overlay.innerHTML = `
      <div class="kb-detail-modal" style="max-width: 700px;">
        <div class="kb-detail-header">
          <div>
            <div class="kb-detail-id">Nhóm dự án: ${this._escHtml(maGoc)}</div>
            <div class="kb-detail-khach">Khách hàng: ${this._escHtml(tenKhach)}</div>
          </div>
          <button class="kb-detail-close" onclick="document.getElementById('kb-group-overlay').remove()">✕</button>
        </div>
        <div class="kb-detail-body" style="display:block; padding-top:16px;">
          ${tableHtml}
        </div>
        <div class="kb-detail-footer">
          <div style="margin-right:auto;"></div>
          <button class="btn btn-ghost" onclick="document.getElementById('kb-group-overlay').remove()">Đóng</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));
  },

  async _confirmAndDeleteOrder(maDon) {
    if (!maDon) return;
    const don = this._kanbanData.find(d => d.ma_don === maDon);
    if (!don) return;

    // Tìm xem có đơn con không
    const donConList = (this._danhSachDon || []).filter(d => d.don_cha === maDon);
    const hasChildren = donConList.length > 0;
    
    let warningMsg = `Bạn có chắc chắn muốn XÓA CỨNG đơn hàng này?\n\n`;
    warningMsg += `Mã đơn: ${don.ma_don}\n`;
    warningMsg += `Khách hàng: ${don.ten_khach || ''}\n`;
    warningMsg += `Item: ${don.item || ''}\n`;
    warningMsg += `Tổng giá trị: ${(Number(don.tong_gia_tri) || 0).toLocaleString('vi-VN')} đ\n\n`;
    
    if (hasChildren) {
       warningMsg += `CẢNH BÁO: Đơn này là đơn gốc của ${donConList.length} đơn con (${donConList.map(c => c.ma_don).join(', ')}).\nXóa sẽ khiến các đơn con này thành đơn độc lập (mất liên kết nhóm).\n\n`;
    }
    
    warningMsg += `LƯU Ý: Thao tác này sẽ XÓA SẠCH dữ liệu khỏi mọi file (crm-data & tài chính) và KHÔNG THỂ KHÔI PHỤC. (Ảnh trên Drive được giữ lại làm backup).\n\nBấm OK để XÓA.`;

    if (!window.confirm(warningMsg)) return;

    const btn = document.querySelector('.kb-detail-footer .btn-primary[style*="background:#c0392b"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:12px;height:12px;"></span> Đang xóa...'; }

    try {
      this._showToast(`Đang thực thi xóa đơn ${maDon}...`, 'info');
      await this._xoaDon(maDon);
      
      this._showToast(`✅ Đã xóa hoàn toàn đơn ${maDon}`, 'success');
      this._closeCardDetail();
      this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
      
    } catch (err) {
      console.error(err);
      this._showToast(`Lỗi xóa đơn: ${err.message}`, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Xóa đơn'; }
    }
  },

  async _confirmAndHideOrder(maDon) {
    const input = window.prompt('Gõ chữ "AN" để xác nhận ẩn đơn này (Đơn sẽ biến mất khỏi mọi màn hình):');
    if (input !== 'AN') return;
    
    const btn = document.querySelector('.kb-detail-footer .btn-ghost[style*="color:#e74c3c"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>...'; }

    try {
      this._showToast(`Đang xử lý ẩn đơn ${maDon}...`, 'info');
      
      const headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
        { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
      );
      const hData = await headerRes.json();
      const headers = (hData.values || [[]])[0] || [];
      const daAnIdx = headers.findIndex(h => h.trim() === 'da_an');
      if (daAnIdx === -1) {
        throw new Error('Không tìm thấy cột da_an trong sheet DON_HANG.');
      }
      const colLetter = this._colIndexToLetter(daAnIdx);
      
      const donHangRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const rowIdx = (donHangRows || []).findIndex(d => d.ma_don === maDon);
      if (rowIdx === -1) {
         throw new Error('Không tìm thấy mã đơn trong dữ liệu để ẩn.');
      }
      const sheetRow = rowIdx + 2; 
      
      await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${sheetRow}`, [['yes']]);
      
      this._showToast(`Đã ẩn đơn ${maDon}`, 'success', 3000);
      this._closeCardDetail();
      
      if (this.currentPage === 'kanban') {
         this.renderKanbanPage();
      } else if (this.currentPage === 'don-hang') {
         this.renderDonHangPage();
      } else if (this.currentPage === 'khach-hang') {
         this.renderKhachHangPage();
      }
    } catch (e) {
      console.error(e);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg> Ẩn đơn (Admin)`;
      }
      this._showToast(`Lỗi khi ẩn đơn: ${e.message}`, 'error');
    }
  },

  async _openDonDaAnModal() {
    if (this.session?.role !== 'admin') return;
    
    // Create or get modal container
    let modal = document.getElementById('da-an-modal');
    if (modal) modal.remove(); // Xóa modal cũ nếu còn kẹt

    modal = document.createElement('div');
    modal.id = 'da-an-modal';
    modal.className = 'kb-overlay'; // Để animation chạy
    modal.style.zIndex = '9999';
    document.body.appendChild(modal);

    modal.innerHTML = `
      <div class="kb-detail-modal" style="max-width:800px; padding:24px;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--clr-border); padding-bottom:12px; margin-bottom:16px;">
          <h2 style="margin:0; font-size:18px; color:var(--clr-error);">Thùng rác - Đơn đã ẩn</h2>
          <button class="kb-detail-close" onclick="const m = document.getElementById('da-an-modal'); if(m){ m.classList.remove('kb-overlay-visible'); setTimeout(() => m.remove(), 250); }">✕</button>
        </div>
        <div id="da-an-content" style="min-height:200px; display:flex; justify-content:center; align-items:center;">
          <div class="spinner"></div> <span style="margin-left:8px; color:var(--clr-text-muted);">Đang tải danh sách...</span>
        </div>
      </div>
    `;

    // Click ra ngoài để đóng
    modal.addEventListener('click', e => { 
      if (e.target === modal) {
        modal.classList.remove('kb-overlay-visible'); 
        setTimeout(() => modal.remove(), 250);
      } 
    });

    requestAnimationFrame(() => modal.classList.add('kb-overlay-visible'));

    try {
      const donHangRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const hiddenOrders = (donHangRows || []).filter(d => d.da_an === 'yes');
      
      const content = document.getElementById('da-an-content');
      
      if (hiddenOrders.length === 0) {
        content.innerHTML = `<div style="text-align:center; color:var(--clr-text-muted); font-style:italic;">Không có đơn đã ẩn nào.</div>`;
        return;
      }
      
      let tableHtml = `
        <div style="max-height:60vh; overflow-y:auto;">
          <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">
            <thead style="background:#f8f9fa; position:sticky; top:0; z-index:1;">
              <tr>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border);">Mã đơn</th>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border);">Ngày lên</th>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border);">Tên khách</th>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border);">Item</th>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border);">Sale phụ trách</th>
                <th style="padding:10px; border-bottom:2px solid var(--clr-border); text-align:right;">Thao tác</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      hiddenOrders.forEach(d => {
        tableHtml += `
          <tr style="border-bottom:1px solid var(--clr-border-light);">
            <td style="padding:10px; font-weight:600;">${this._escHtml(d.ma_don)}</td>
            <td style="padding:10px;">${this._escHtml(d.ngay_len_don || '')}</td>
            <td style="padding:10px;">${this._escHtml(d.ten_khach || '')}</td>
            <td style="padding:10px;">${this._escHtml(d.item || '')}</td>
            <td style="padding:10px;">${this._escHtml(d.sale_phu_trach || '')}</td>
            <td style="padding:10px; text-align:right;">
              <button class="btn btn-sm btn-outline" style="color:var(--clr-accent); border-color:var(--clr-accent);" onclick="App._khoiPhucDon('${this._escHtml(d.ma_don)}')">
                Khôi phục
              </button>
            </td>
          </tr>
        `;
      });
      
      tableHtml += `</tbody></table></div>`;
      content.innerHTML = tableHtml;
      
    } catch (e) {
      console.error(e);
      document.getElementById('da-an-content').innerHTML = `<div style="color:var(--clr-error);">Lỗi tải dữ liệu: ${this._escHtml(e.message)}</div>`;
    }
  },

  async _khoiPhucDon(maDon) {
    if (!window.confirm(`Khôi phục đơn ${maDon}? Đơn sẽ xuất hiện lại trên bảng Kanban và các báo cáo.`)) return;
    
    try {
      this._showToast(`Đang khôi phục đơn ${maDon}...`, 'info');
      
      // Load DON_HANG header to find da_an column
      const headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
        { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
      );
      const hData = await headerRes.json();
      const headers = (hData.values || [[]])[0] || [];
      const daAnIdx = headers.findIndex(h => h.trim() === 'da_an');
      if (daAnIdx === -1) {
        throw new Error('Không tìm thấy cột da_an trong sheet DON_HANG.');
      }
      const colLetter = this._colIndexToLetter(daAnIdx);
      
      // Load DON_HANG data to find row
      const donHangRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const rowIdx = (donHangRows || []).findIndex(d => d.ma_don === maDon);
      if (rowIdx === -1) {
         throw new Error('Không tìm thấy mã đơn trong dữ liệu để khôi phục.');
      }
      const sheetRow = rowIdx + 2; 
      
      await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${sheetRow}`, [['']]);
      
      this._showToast(`Đã khôi phục đơn ${maDon}`, 'success', 3000);
      
      // Reload modal and kanban
      this._openDonDaAnModal();
      
      if (this.currentPage === 'kanban') {
         this.renderKanbanPage();
      } else if (this.currentPage === 'don-hang') {
         this.renderDonHangPage();
      } else if (this.currentPage === 'khach-hang') {
         this.renderKhachHangPage();
      }
    } catch (e) {
      console.error(e);
      this._showToast(`Lỗi khi khôi phục đơn: ${e.message}`, 'error');
    }
  },

  async _submitHuyDon(maDon, daThucThu) {
    const radioA = document.getElementById('det-huy-loai-A');
    const isHoan100 = radioA && radioA.checked;
    
    const hoanInput = document.getElementById('det-huy-hoan-tien');
    const hoanTien = isHoan100 ? daThucThu : this._parseCurrency(hoanInput.value);
    
    if (hoanTien > daThucThu) {
       this._showToast(`Số tiền hoàn không được vượt quá số đã thu (${daThucThu.toLocaleString('vi-VN')} ₫)`, 'error');
       return;
    }
    
    const lyDo = document.getElementById('det-huy-ly-do').value.trim();
    
    const btn = document.querySelector('#det-huy-don-form .btn[style*="background:#c0392b"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>...'; }
    
    try {
      const trangThai = isHoan100 ? 'hủy-hoàn cọc' : 'hủy-giữ cọc';
      
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yy = now.getFullYear();
      const ngay = `${dd}/${mm}/${yy}`;
      
      if (hoanTien > 0) {
        const nguon = 'Pixel';
        const loai = 'hoàn cọc';
        const soTienAm = -hoanTien;
        const newId = this._taoIdGiaoDich();
        await this._appendSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, [[ maDon, ngay, loai, soTienAm, nguon, newId ]]);
        
        if (!this._giaoDichTienList) this._giaoDichTienList = [];
        this._giaoDichTienList.push({ ma_don: maDon, ngay, loai, so_tien: soTienAm, nguon, id_giao_dich: newId });
      }
      
      if (lyDo) {
         let currentUser = this.session?.email || '';
         if (this._nhanSuList) {
           const ns = this._nhanSuList.find(n => n.email === currentUser);
           if (ns) currentUser = ns.ten || ns.ho_ten || ns.ten_nhan_vien || ns.ten_designer || ns.designer || currentUser;
         }
         const hh = String(now.getHours()).padStart(2, '0');
         const min = String(now.getMinutes()).padStart(2, '0');
         const thoiGian = `${ngay} ${hh}:${min}`;
         const noiDung = `HỦY ĐƠN: ${lyDo}`;
         
         await this._appendSheet(CONFIG.SHEETS.COMMENT, [[ maDon, currentUser, thoiGian, noiDung ]]);
         
         if (!this._commentList) this._commentList = [];
         this._commentList.push({ ma_don: maDon, nguoi: currentUser, thoi_gian: thoiGian, noi_dung: noiDung });
      }

      // Instead of manual write sheet, we can just use the UI fields + save if it's already implemented, 
      // but _updateDonHangTrangThai is cleaner if the modal shouldn't close instantly or overwrite forms.
      const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const rowIdx = rows.findIndex(r => r.ma_don === maDon);
      if (rowIdx !== -1) {
         const headerRes = await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
           { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
         );
         const hData = await headerRes.json();
         const headers = (hData.values || [[]])[0] || [];
         const colIdx = headers.indexOf('trang_thai');
         if (colIdx !== -1) {
            const col = this._colIndexToLetter(colIdx);
            await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${col}${rowIdx + 2}`, [[trangThai]]);
         }
      }
      
      this._showToast('Đã hủy đơn thành công!', 'success');
      
      const don = this._kanbanData.find(d => d.ma_don === maDon);
      if (don) don.trang_thai = trangThai;
      
      this._openCardDetail(maDon); 
      this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
    } catch (e) {
      this._showToast('Lỗi khi hủy đơn: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Xác nhận hủy'; }
    }
  },

  _tinhNgayThuDuDong(maDon, soPhaiThu) {
     if (soPhaiThu === undefined || soPhaiThu === null || soPhaiThu <= 0) return '';
     const gList = (this._giaoDichTienList || []).filter(g => g.ma_don === maDon);
     if (gList.length === 0) return '';
     
     const sortedList = [...gList].sort((a, b) => {
        const [d1, m1, y1] = (a.ngay || '').split('/');
        const [d2, m2, y2] = (b.ngay || '').split('/');
        const date1 = new Date(y1, (m1 || 1) - 1, d1).getTime();
        const date2 = new Date(y2, (m2 || 1) - 1, d2).getTime();
        return date1 - date2;
     });
     
     let cumulative = 0;
     for (const g of sortedList) {
        const tien = this._parseCurrency(g.so_tien);
        if (!isNaN(tien)) cumulative += tien;
        if (cumulative >= soPhaiThu) {
           return g.ngay || '';
        }
     }
     return '';
  },

  async _syncNgayThuDu(maDon, forceOverride = false) {
     const don = this._kanbanData.find(d => d.ma_don === maDon);
     if (!don) return;
     
     // Trừ khi bị ép ghi đè (khi sửa ngày giao dịch), còn lại nếu đã có ngay_thu_du thì bỏ qua
     if (!forceOverride && don.ngay_thu_du) return;
     
     let tongGiaTri = this._parseCurrency(don.tong_gia_tri);
     if (tongGiaTri <= 0) {
        try {
           const tdRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => []);
           const tdRow = tdRows.find(r => r.ma_don === maDon);
           if (tdRow) {
              don.tong_gia_tri = tdRow.tong_gia_tri;
              tongGiaTri = this._parseCurrency(tdRow.tong_gia_tri);
           }
        } catch (err) {}
     }
     
     const soPhaiThu = this._tinhSoPhaiThu(don);
     if (soPhaiThu <= 0) return;
     
     const computedNgay = this._tinhNgayThuDuDong(maDon, soPhaiThu);
     
     if (don.ngay_thu_du !== computedNgay) {
         const headerRes = await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
           { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
         );
         const hData = await headerRes.json();
         const headers = (hData.values || [[]])[0] || [];
         const colIdx = headers.findIndex(h => h.trim() === 'ngay_thu_du');
         if (colIdx !== -1) {
            const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
            const rowIdx = rows.findIndex(r => r.ma_don === maDon);
            if (rowIdx !== -1) {
               const colLetter = this._colIndexToLetter(colIdx);
               const sheetRow = rowIdx + 2;
               await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${sheetRow}`, [[computedNgay]]);
               don.ngay_thu_du = computedNgay; 
            }
         }
     }
  },

  async _saveGiaoDichDate(maDon, idGiaoDich) {
    try {
      const input = document.getElementById(`gd-input-${idGiaoDich}`);
      if (!input || !input.value) return; 
      
      const rawVal = input.value; 
      const parts = rawVal.split('-');
      if (parts.length !== 3) return;
      const newNgay = `${parts[2]}/${parts[1]}/${parts[0]}`; 
      
      input.disabled = true;
      const btn = input.nextElementSibling;
      btn.innerText = '...';
      btn.disabled = true;
      
      const token = this.session?.accessToken;
      if (!token) throw new Error('Chưa đăng nhập');
      
      const targetSpreadsheetId = this._getSpreadsheetIdFor(CONFIG.SHEETS.GIAO_DICH_TIEN);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(CONFIG.SHEETS.GIAO_DICH_TIEN)}`;
      
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Lỗi đọc dữ liệu giao dịch');
      const dataObj = await res.json();
      const rows = dataObj.values || [];
      if (rows.length < 2) throw new Error('Sheet trống');
      
      let foundIndex = -1;
      let matchedRow = null;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][5]).trim() === idGiaoDich) {
           foundIndex = i;
           matchedRow = rows[i];
           break;
        }
      }
      
      if (foundIndex === -1) throw new Error('Không tìm thấy giao dịch này trên Sheet!');
      
      const gList = this._giaoDichTienList || [];
      const localG = gList.find(g => g.id_giao_dich === idGiaoDich);
      if (!localG) throw new Error('Giao dịch không tồn tại trong cache!');
      
      const sheetMaDon = String(matchedRow[0]).trim();
      const sheetLoai = String(matchedRow[2]).trim();
      const sheetTienStr = String(matchedRow[3]).replace(/[^0-9-]/g, '');
      const localTienStr = String(localG.so_tien).replace(/[^0-9-]/g, '');
      
      if (sheetMaDon !== localG.ma_don || sheetLoai !== localG.loai || sheetTienStr !== localTienStr) {
         throw new Error('Không xác định đúng giao dịch, vui lòng thử lại');
      }
      
      const sheetRow = foundIndex + 1;
      await this._writeSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, `B${sheetRow}`, [[newNgay]]);
      
      localG.ngay = newNgay;
      
      // Đồng bộ lại ngày thu đủ dựa trên lịch sử mới (forceOverride = true)
      await this._syncNgayThuDu(maDon, true);
      
      this._showToast('Đã sửa ngày giao dịch!', 'success');
      this._openCardDetail(maDon);
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi sửa ngày: ' + err.message, 'error');
      const input = document.getElementById(`gd-input-${idGiaoDich}`);
      if (input) {
        input.disabled = false;
        const btn = input.nextElementSibling;
        if (btn) {
          btn.innerText = 'Lưu';
          btn.disabled = false;
        }
      }
    }
  },

  async _saveGiaoDichAmount(maDon, idGiaoDich) {
    try {
      if (this.session?.role !== 'admin') throw new Error('Chỉ Admin mới có quyền sửa số tiền');
      const input = document.getElementById(`gd-input-amount-${idGiaoDich}`);
      if (!input || !input.value) return; 
      
      const rawVal = input.value.replace(/[^0-9]/g, '');
      const newSoTien = parseInt(rawVal, 10);
      if (isNaN(newSoTien) || newSoTien <= 0) throw new Error('Số tiền không hợp lệ');
      
      input.disabled = true;
      const btn = input.nextElementSibling?.nextElementSibling;
      if (btn) {
          btn.innerText = '...';
          btn.disabled = true;
      }
      
      const token = this.session?.accessToken;
      if (!token) throw new Error('Chưa đăng nhập');
      
      const targetSpreadsheetId = this._getSpreadsheetIdFor(CONFIG.SHEETS.GIAO_DICH_TIEN);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(CONFIG.SHEETS.GIAO_DICH_TIEN)}`;
      
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Lỗi đọc dữ liệu giao dịch');
      const dataObj = await res.json();
      const rows = dataObj.values || [];
      if (rows.length < 2) throw new Error('Sheet trống');
      
      let foundIndex = -1;
      let matchedRow = null;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][5]).trim() === idGiaoDich) {
           foundIndex = i;
           matchedRow = rows[i];
           break;
        }
      }
      
      if (foundIndex === -1) throw new Error('Không tìm thấy giao dịch này trên Sheet!');
      
      const gList = this._giaoDichTienList || [];
      const localG = gList.find(g => g.id_giao_dich === idGiaoDich);
      if (!localG) throw new Error('Giao dịch không tồn tại trong cache!');
      
      const sheetMaDon = String(matchedRow[0]).trim();
      const sheetLoai = String(matchedRow[2]).trim();
      const sheetTienStr = String(matchedRow[3]).replace(/[^0-9-]/g, '');
      const localTienStr = String(localG.so_tien).replace(/[^0-9-]/g, '');
      
      if (sheetMaDon !== localG.ma_don || sheetLoai !== localG.loai || sheetTienStr !== localTienStr) {
         throw new Error('Không xác định đúng giao dịch, vui lòng thử lại');
      }
      
      const sheetRow = foundIndex + 1;
      await this._writeSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, `D${sheetRow}`, [[newSoTien]]);
      
      localG.so_tien = newSoTien;
      
      await this._syncNgayThuDu(maDon, true);
      
      this._showToast('Đã sửa số tiền giao dịch!', 'success');
      this._openCardDetail(maDon);
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi sửa tiền: ' + err.message, 'error');
      const input = document.getElementById(`gd-input-amount-${idGiaoDich}`);
      if (input) {
        input.disabled = false;
        const btn = input.nextElementSibling?.nextElementSibling;
        if (btn) {
          btn.innerText = 'Lưu';
          btn.disabled = false;
        }
      }
    }
  },

  async _xoaGiaoDich(idGiaoDich, maDon) {
    try {
      if (this.session?.role !== 'admin') throw new Error('Chỉ Admin mới có quyền xóa giao dịch');
      
      const gList = this._giaoDichTienList || [];
      const localG = gList.find(g => g.id_giao_dich === idGiaoDich);
      if (!localG) throw new Error('Giao dịch không tồn tại trong cache!');
      
      const confirmMsg = `Bạn có chắc chắn muốn XÓA CỨNG giao dịch này?\n\n- Loại: ${localG.loai}\n- Ngày: ${localG.ngay}\n- Số tiền: ${Number((localG.so_tien || '').toString().replace(/[^0-9.-]/g, '') || 0).toLocaleString('vi-VN')} ₫\n\nHành động này không thể hoàn tác!`;
      if (!window.confirm(confirmMsg)) return;
      
      const token = this.session?.accessToken;
      if (!token) throw new Error('Chưa đăng nhập');
      
      const targetSpreadsheetId = this._getSpreadsheetIdFor(CONFIG.SHEETS.GIAO_DICH_TIEN);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(CONFIG.SHEETS.GIAO_DICH_TIEN)}`;
      
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Lỗi đọc dữ liệu giao dịch');
      const dataObj = await res.json();
      const rows = dataObj.values || [];
      if (rows.length < 2) throw new Error('Sheet trống');
      
      let foundIndex = -1;
      let matchedRow = null;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][5]).trim() === idGiaoDich) {
           foundIndex = i; // rows là mảng 0-based từ Google API, header là rows[0]. Vì vậy index của dòng dữ liệu đúng bằng index của hàng (0-based) trong Sheet!
           matchedRow = rows[i];
           break;
        }
      }
      
      if (foundIndex === -1) throw new Error('Không tìm thấy giao dịch này trên Sheet!');
      
      const sheetMaDon = String(matchedRow[0]).trim();
      const sheetLoai = String(matchedRow[2]).trim();
      const sheetTienStr = String(matchedRow[3]).replace(/[^0-9-]/g, '');
      const localTienStr = String(localG.so_tien).replace(/[^0-9-]/g, '');
      
      if (sheetMaDon !== localG.ma_don || sheetLoai !== localG.loai || sheetTienStr !== localTienStr) {
         throw new Error('Không xác định đúng giao dịch, vui lòng thử lại');
      }
      
      const sheetId = await this._getSheetId(targetSpreadsheetId, CONFIG.SHEETS.GIAO_DICH_TIEN);
      if (sheetId === null || sheetId === undefined) {
         throw new Error('Không lấy được ID của tab GIAO_DICH_TIEN để xóa');
      }
      
      await this._deleteSheetRow(targetSpreadsheetId, sheetId, foundIndex);
      
      this._giaoDichTienList = this._giaoDichTienList.filter(g => g.id_giao_dich !== idGiaoDich);
      
      await this._syncNgayThuDu(maDon, true);
      
      this._showToast('Đã xóa giao dịch thành công!', 'success');
      this._openCardDetail(maDon);
      
    } catch (err) {
      console.error(err);
      this._showToast('Lỗi xóa giao dịch: ' + err.message, 'error');
    }
  },

  async _saveFileName(maDon, index, expectedUrl) {
     const input = document.getElementById(`edit-file-input-${index}`);
     if (!input) return;
     const newName = input.value.trim().replace(/[\n|]/g, ' ');
     if (!newName) {
       this._showToast('Tên không được để trống', 'error');
       return;
     }
     
     const don = this._kanbanData.find(d => d.ma_don === maDon);
     if (!don) return;
     
     const linkLines = (don.link_anh || '').split('\n').filter(Boolean);
     if (index < 0 || index >= linkLines.length) {
       this._showToast('Không tìm thấy file, thử lại', 'error');
       return;
     }
     
     const targetLine = linkLines[index];
     const parts = targetLine.split('|');
     if (parts[0] !== expectedUrl) {
       this._showToast('Không xác định đúng file, thử lại', 'error');
       return;
     }
     
     linkLines[index] = `${expectedUrl}|${newName}`;
     const newLinkAnh = linkLines.join('\n');
     
     try {
         const headerRes = await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
           { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
         );
         const hData = await headerRes.json();
         const headers = (hData.values || [[]])[0] || [];
         const colIdx = headers.findIndex(h => h.trim() === 'link_anh');
         if (colIdx !== -1) {
            const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
            const rowIdx = rows.findIndex(r => r.ma_don === maDon);
            if (rowIdx !== -1) {
               const colLetter = this._colIndexToLetter(colIdx);
               const sheetRow = rowIdx + 2;
               await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${sheetRow}`, [[newLinkAnh]]);
               don.link_anh = newLinkAnh; 
               this._showToast('Đã sửa tên file', 'success');
               this._openCardDetail(maDon);
            } else {
               throw new Error('Không tìm thấy đơn hàng');
            }
         }
     } catch (err) {
        console.error(err);
        this._showToast('Lỗi: ' + err.message, 'error');
     }
  },

  async _confirmSuaTongGiaTri(maDon) {
    if (!this.session?.accessToken || (this.session.role !== 'admin' && this.session.role !== 'sale')) return;
    
    const newValRaw = document.getElementById('det-tong-gia-tri-hidden')?.value;
    const newVal = this._parseCurrency(newValRaw);
    
    const loaiGiam = document.getElementById('det-giam-gia-loai')?.value || '';
    const giaTriGiamRaw = document.getElementById('det-giam-gia-gia-tri-hidden')?.value || '';
    let giaTriGiam = 0;

    if (isNaN(newVal) || newVal <= 0) {
      this._showToast('Vui lòng nhập tổng giá trị hợp lệ (>0).', 'error');
      return;
    }

    if (loaiGiam === 'percent') {
        giaTriGiam = parseFloat(giaTriGiamRaw.toString().replace(/,/g, '.'));
        if (isNaN(giaTriGiam) || giaTriGiam < 0 || giaTriGiam > 100) {
            this._showToast('Vui lòng nhập % giảm giá hợp lệ (0-100).', 'error');
            return;
        }
    } else if (loaiGiam === 'amount') {
        giaTriGiam = this._parseCurrency(giaTriGiamRaw);
        if (giaTriGiam < 0) {
            this._showToast('Vui lòng nhập số tiền giảm hợp lệ (>=0).', 'error');
            return;
        }
    }

    const don = (this._kanbanData || []).find(d => d.ma_don === maDon);
    if (!don) return;

    if (newVal === this._parseCurrency(don.tong_gia_tri) && 
        loaiGiam === (don.giam_gia_loai || '').trim() && 
        giaTriGiam.toString() === (don.giam_gia_gia_tri || '').toString()) {
       this._showToast('Giá trị không đổi.', 'info');
       return;
    }

    this._showToast('Đang lưu dữ liệu...', 'info');
    try {
      // 1. Lấy index dòng
      const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const rowIdx = rows.findIndex(r => r.ma_don === maDon);
      
      let donHangHeaders = [];
      if (rowIdx !== -1) {
         const headerRes = await fetch(
           `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
           { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
         );
         const hData = await headerRes.json();
         donHangHeaders = (hData.values || [[]])[0] || [];
         
         const writes = [];
         
         // Ghi tong_gia_tri
         const colIdx = donHangHeaders.findIndex(h => h.trim().toLowerCase() === 'tong_gia_tri');
         if (colIdx !== -1) {
            writes.push(this._writeSheet(CONFIG.SHEETS.DON_HANG, `${this._colIndexToLetter(colIdx)}${rowIdx + 2}`, [[newVal]]));
         }
         
         // Ghi giam_gia_loai
         const colLoai = donHangHeaders.findIndex(h => h.trim().toLowerCase() === 'giam_gia_loai');
         if (colLoai !== -1) {
            writes.push(this._writeSheet(CONFIG.SHEETS.DON_HANG, `${this._colIndexToLetter(colLoai)}${rowIdx + 2}`, [[loaiGiam]]));
         }
         
         // Ghi giam_gia_gia_tri
         const colGt = donHangHeaders.findIndex(h => h.trim().toLowerCase() === 'giam_gia_gia_tri');
         if (colGt !== -1) {
            writes.push(this._writeSheet(CONFIG.SHEETS.DON_HANG, `${this._colIndexToLetter(colGt)}${rowIdx + 2}`, [[loaiGiam ? giaTriGiam : '']]));
         }
         
         await Promise.all(writes);
      }

      // 2. Ghi TIEN_DON (vì đây là nguồn load đè ưu tiên cho tong_gia_tri)
      await this._saveTienDon(maDon, newVal);
      
      // Cập nhật cache
      don.tong_gia_tri = newVal;
      don.giam_gia_loai = loaiGiam;
      don.giam_gia_gia_tri = loaiGiam ? giaTriGiam : '';

      // 3. Tính tổng đã thu và xử lý 3 trường hợp ngay_thu_du
      let tongDaThu = 0;
      (this._giaoDichTienList || []).filter(g => g.ma_don === maDon).forEach(g => {
         const tien = this._parseCurrency(g.so_tien);
         if (!isNaN(tien)) tongDaThu += tien;
      });

      const soPhaiThu = this._tinhSoPhaiThu(don);
      const isThuDuMoi = (soPhaiThu > 0 && tongDaThu >= soPhaiThu);
      const isThuDuCu = !!don.ngay_thu_du;

      if (isThuDuMoi && !isThuDuCu) {
          await this._syncNgayThuDu(maDon, true);
      } else if (!isThuDuMoi && isThuDuCu) {
          if (rowIdx !== -1) {
              const idxNgay = donHangHeaders.findIndex(h => h.trim() === 'ngay_thu_du');
              if (idxNgay !== -1) {
                 const colLetter = this._colIndexToLetter(idxNgay);
                 await this._writeSheet(CONFIG.SHEETS.DON_HANG, `${colLetter}${rowIdx + 2}`, [['']]);
                 don.ngay_thu_du = '';
              }
          }
      }

      this._showToast('Cập nhật thành công!', 'success');
      this._openCardDetail(maDon);

    } catch (e) {
      console.error(e);
      this._showToast('Lỗi khi lưu dữ liệu: ' + e.message, 'error');
    }
  },

  async _submitThuTien(maDon) {
    const input = document.getElementById('det-thu-tien-input');
    const select = document.getElementById('det-thu-loai');
    const btn = input.nextElementSibling?.nextElementSibling?.querySelector('.btn-primary') || document.querySelector('#det-thu-tien-form .btn-primary');
    
    const rawVal = input.value.replace(/,/g, '');
    const soTien = this._parseCurrency(rawVal);
    if (!soTien || isNaN(soTien) || soTien <= 0) {
       this._showToast('Vui lòng nhập số tiền hợp lệ (> 0)', 'error');
       return;
    }
    
    const conNo = this._parseCurrency(input.dataset.conno);
    let rowsToInsert = [];
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = now.getFullYear();
    const ngay = `${dd}/${mm}/${yy}`;
    const nguon = 'Pixel';
    
    if (soTien > conNo && conNo > 0) {
       const tip = soTien - conNo;
       const cf = confirm(`Số tiền vượt quá phần còn nợ ${conNo.toLocaleString('vi-VN')} ₫.\nPhần dư ${tip.toLocaleString('vi-VN')} ₫ sẽ được ghi nhận là TIP.\nXác nhận?`);
       if (!cf) return;
       rowsToInsert.push([ maDon, ngay, 'thu nốt', conNo, nguon, this._taoIdGiaoDich() ]);
       rowsToInsert.push([ maDon, ngay, 'tip', tip, nguon, this._taoIdGiaoDich() ]);
    } else if (conNo <= 0) {
       const cf = confirm(`Đơn đã thu đủ. Khoản ${soTien.toLocaleString('vi-VN')} ₫ này sẽ được ghi nhận là TIP.\nXác nhận?`);
       if (!cf) return;
       rowsToInsert.push([ maDon, ngay, 'tip', soTien, nguon, this._taoIdGiaoDich() ]);
    } else {
       rowsToInsert.push([ maDon, ngay, select.value, soTien, nguon, this._taoIdGiaoDich() ]);
    }
    
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>...'; }
    
    try {
      if (!this._giaoDichTienList) this._giaoDichTienList = [];
      
      for (const row of rowsToInsert) {
         await this._appendSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, [row]);
         this._giaoDichTienList.push({ ma_don: row[0], ngay: row[1], loai: row[2], so_tien: row[3], nguon: row[4], id_giao_dich: row[5] });
      }
      
      // -- Bắt đầu: Tự động ghi ngay_thu_du --
      const don = this._kanbanData.find(d => d.ma_don === maDon);
      if (don) {
         let tongDaThu = 0;
         this._giaoDichTienList.filter(g => g.ma_don === maDon).forEach(g => {
            const tien = this._parseCurrency(g.so_tien);
            if (!isNaN(tien)) tongDaThu += tien;
         });
         
         let tongGiaTri = this._parseCurrency(don.tong_gia_tri);
         
         // Nếu tongGiaTri đang là 0 hoặc chưa có, thử đọc lại trực tiếp từ TIEN_DON
         if (tongGiaTri <= 0) {
            try {
               const tdRows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.TIEN_DON, 'A:B').catch(() => []);
               const tdRow = tdRows.find(r => r.ma_don === maDon);
               if (tdRow) {
                  tongGiaTri = this._parseCurrency(tdRow.tong_gia_tri);
                  don.tong_gia_tri = tongGiaTri; // update cache
               }
            } catch (err) {
               console.warn('Lỗi đọc TIEN_DON khi thu tiền:', err);
            }
         }
         
         const soPhaiThu = this._tinhSoPhaiThu(don);
         console.log(`[Check ngay_thu_du] Đơn ${maDon}: tongDaThu=${tongDaThu}, soPhaiThu=${soPhaiThu}, ngay_thu_du="${don.ngay_thu_du}"`);
         
         // Gọi hàm đồng bộ ngày thu đủ (sẽ tự động tính dựa trên luỹ kế và chỉ ghi nếu đang trống)
         await this._syncNgayThuDu(maDon, false);
      }
      // -- Kết thúc: Tự động ghi ngay_thu_du --

      this._showToast('Đã thêm giao dịch thành công!', 'success');
      this._openCardDetail(maDon); // re-render popup
    } catch (e) {
      this._showToast('Lỗi: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Xác nhận thu'; }
    }
  },

  _onDesignerSelect(selectEl) {
    const val = selectEl.value;
    if (!val) return;
    const container = document.getElementById('det-designer-tags');
    const span = document.createElement('span');
    span.className = 'kb-tag';
    span.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:var(--clr-bg);border:1px solid var(--clr-border);';
    span.innerHTML = `
      ${this._escHtml(val)}
      <input type="hidden" name="assigned_designer" value="${this._escHtml(val)}" />
      <svg onclick="this.parentElement.remove(); App._updateDesignerSelect();" style="cursor:pointer;color:#E74C3C;" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    `;
    container.appendChild(span);
    this._updateDesignerSelect();
  },

  _updateDesignerSelect() {
    const assigned = Array.from(document.querySelectorAll('input[name="assigned_designer"]')).map(el => el.value);
    const selectEl = document.getElementById('det-designer-select');
    if (!selectEl) return;
    const allDesigners = (this._nhanSuList || []).filter(n => n.vai_tro === 'designer').map(n => n.ten || n.ho_ten || n.ten_nhan_vien || n.email || '');
    const available = allDesigners.filter(d => d && !assigned.includes(d));
    selectEl.innerHTML = `<option value="">+ Thêm designer...</option>` + available.map(d => `<option value="${this._escHtml(d)}">${this._escHtml(d)}</option>`).join('');
  },

  _calculateTotalScore() {
    let totalScoreTam = 0;
    document.querySelectorAll('.det-designer-score-temp').forEach(inp => {
       const val = parseFloat(inp.value.replace(/,/g, '.'));
       if (!isNaN(val)) totalScoreTam += val;
    });
    const totalEl = document.getElementById('det-total-score');
    if (totalEl) {
       totalEl.innerText = Number(totalScoreTam.toFixed(2));
    }
  },

  _onDiemTamInput(inp) {
    this._calculateTotalScore();
  },

  _onDetFileSelect(e) {
    const files = Array.from(e.target.files).map(f => ({ file: f, tenHienThi: f.name }));
    this._detSelectedFiles = (this._detSelectedFiles || []).concat(files);
    const list = document.getElementById('det-file-list');
    if (list) {
      list.innerHTML = this._detSelectedFiles.map((item, i) => 
        `<div style="display:flex; justify-content:space-between; margin-bottom:4px; padding:4px; background:rgba(0,0,0,0.03); border-radius:4px; align-items:center;">
          <input type="text" value="${this._escHtml(item.tenHienThi)}" onchange="App._updateDetSelectedFileName(${i}, this.value)" style="flex:1; margin-right:8px; border:1px solid #ccc; background:#fff; font-size:12px; padding:2px 4px; border-radius:2px;" title="Sửa tên file">
          <button style="background:none; border:none; cursor:pointer; color:#E74C3C; flex-shrink:0;" onclick="App._removeDetFile(${i})">✕</button>
        </div>`
      ).join('');
    }
    e.target.value = '';
  },

  _updateDetSelectedFileName(index, newName) {
    if (!this._detSelectedFiles || !this._detSelectedFiles[index]) return;
    const nameStr = (newName || '').trim().replace(/[\n|]/g, ' ');
    this._detSelectedFiles[index].tenHienThi = nameStr || this._detSelectedFiles[index].file.name;
  },

  _removeDetFile(idx) {
    if (this._detSelectedFiles) {
      this._detSelectedFiles.splice(idx, 1);
      this._onDetFileSelect({target: {files: []}});
    }
  },

  async _saveCardDetail(maDon) {
    const btn = document.getElementById('btn-save-detail');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Đang lưu...'; }

    const isDesigner = this.session?.role === 'designer';

    const rawDt = document.getElementById('det-ngay-het-han')?.value;
    let formattedDt = '';
    if (rawDt) {
      const dateObj = new Date(rawDt);
      if (!isNaN(dateObj)) {
         const dd = String(dateObj.getDate()).padStart(2, '0');
         const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
         const yy = dateObj.getFullYear();
         const hh = String(dateObj.getHours()).padStart(2, '0');
         const min = String(dateObj.getMinutes()).padStart(2, '0');
         formattedDt = `${dd}/${mm}/${yy} ${hh}:${min}`;
      }
    }

    const rawNld = document.getElementById('det-ngay-len-don')?.value;
    let formattedNld = '';
    if (rawNld) {
      const parts = rawNld.split('-');
      if (parts.length === 3) {
        formattedNld = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }
    }

    const patch = {
      ten_khach:      document.getElementById('det-ten-khach')?.value.trim(),
      brand:          document.getElementById('det-brand')?.value.trim(),
      nganh:          document.getElementById('det-nganh')?.value.trim(),
      item:           document.getElementById('det-item')?.value.trim(),
      ngay_het_han:   formattedDt || rawDt || '',
      ...(formattedNld ? { ngay_len_don: formattedNld } : {}),
      ...(isDesigner ? {} : {
        sale_phu_trach: document.getElementById('det-sale')?.value.trim(),
        diem_don:       document.getElementById('det-diem-don')?.value.trim() || '',
        brief:          document.getElementById('det-brief')?.value.trim(),
        cot_kanban:     document.getElementById('det-cot-kanban')?.value,
        trang_thai:     document.getElementById('det-trang-thai')?.value,
        giam_gia_loai:  document.getElementById('det-giam-gia-loai')?.value || '',
        giam_gia_gia_tri: document.getElementById('det-giam-gia-loai')?.value === 'percent' 
                            ? parseFloat((document.getElementById('det-giam-gia-gia-tri-hidden')?.value || '0').toString().replace(/,/g, '.')) 
                            : (document.getElementById('det-giam-gia-loai')?.value === 'amount' 
                                ? App._parseCurrency(document.getElementById('det-giam-gia-gia-tri-hidden')?.value || '0') 
                                : ''),
      }),
    };

    if (!isDesigner) {
      const dmEl = document.getElementById('det-ngay-duyet-mau');
      if (dmEl) {
         if (dmEl.value) {
            const [y, m, d] = dmEl.value.split('-');
            patch.ngay_duyet_mau = `${d}/${m}/${y}`;
         } else {
            patch.ngay_duyet_mau = '';
         }
      }
    }

    if (!isDesigner && document.getElementById('det-brief')) {
      patch.brief = document.getElementById('det-brief').value.trim();
    }

    const don = this._kanbanData.find(d => d.ma_don === maDon);
    if (!don) throw new Error('Không tìm thấy đơn ' + maDon);

    // Upload file bổ sung nếu có
    if (!isDesigner && this._detSelectedFiles?.length > 0) {
      if (btn) btn.innerHTML = '<span class="spinner"></span> Đang tải file...';
      const newLinks = await this._uploadAnhLenDrive(this._detSelectedFiles, maDon);
      if (newLinks) {
        const cur = don.link_anh ? don.link_anh.trim() : '';
        patch.link_anh = cur ? (cur + '\n' + newLinks) : newLinks;
      }
    }

    // Thu thập nhãn được chọn
    const checkedLabels = [...document.querySelectorAll('.kb-label-cb:checked')].map(cb => ({
      nhan: cb.value,
      mau:  cb.dataset.mau || '#999',
    }));

    try {
      const rows = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG);
      const rowIdx = rows.findIndex(r => r.ma_don === maDon);
      if (rowIdx === -1) throw new Error('Không tìm thấy đơn ' + maDon);

      const headerRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.DON_HANG + '!1:1')}`,
        { headers: { Authorization: `Bearer ${this.session.accessToken}` } }
      );
      const hData = await headerRes.json();
      const headers = (hData.values || [[]])[0] || [];
      const sheetRow = rowIdx + 2;

      // Bổ sung ghi danh sách designer vào cột designer_phu_trach
      const canWriteDesigner = ['admin', 'leader', 'sale'].includes(this.session?.role);
      if (canWriteDesigner && document.getElementById('det-designer-tags')) {
        const assignedDesigners = Array.from(document.querySelectorAll('input[name="assigned_designer"]')).map(el => el.value);
        patch.designer_phu_trach = assignedDesigners.join(', ');
        console.log(`[DEBUG designer] ghi designer_phu_trach = ${patch.designer_phu_trach} cho đơn ${maDon}`);
      }

      // Ghi từng cột có thay đổi
      const writes = Object.entries(patch).map(([key, val]) => {
        const colIdx = headers.findIndex(h => (h || '').toString().trim().toLowerCase() === key.trim().toLowerCase());
        if (colIdx === -1 || val === undefined) return null;
        const col = this._colIndexToLetter(colIdx);
        return this._writeSheet(CONFIG.SHEETS.DON_HANG, `${col}${sheetRow}`, [[val]]);
      }).filter(Boolean);

      // Lưu nhãn vào NHAN_DON
      writes.push(this._saveLabels(maDon, checkedLabels));

      await Promise.all(writes);

      // Cập nhật local cache
      this._kanbanLabelMap[maDon] = checkedLabels;

      // Cập nhật danh sách designer phụ trách (chỉ lưu danh sách, KHÔNG ghi điểm vào DIEM_DESIGNER ở bước này)
      const isRoleSaleAdmin = ['admin', 'leader', 'sale'].includes(this.session?.role);
      if (isRoleSaleAdmin && document.getElementById('det-designer-tags')) {
        const assignedDesigners = Array.from(document.querySelectorAll('input[name="assigned_designer"]')).map(el => el.value);
        // Cập nhật cache danh sách designer phụ trách
        this._kanbanDesignerMap[maDon] = assignedDesigners;

        // ==========================================
        // BƯỚC 1: XỬ LÝ ĐIỂM TẠM -> DIEM_XU_LY
        // ==========================================
        const scoreTempInputs = {};
        let debugFoundCount = 0;
        const tempInputs = document.querySelectorAll('#kb-detail-overlay .det-designer-score-temp');
        debugFoundCount = tempInputs.length;
        
        tempInputs.forEach(inp => {
          const d = inp.getAttribute('data-designer');
          if (d && assignedDesigners.includes(d)) {
            const rawVal = inp.value;
            const processed = rawVal.replace(/,/g, '.').replace(/[^0-9.-]/g, '').trim();
            console.log('[DEBUG diem tam] Đọc trực tiếp - designer:', d, '| raw .value:', rawVal, '| processed:', processed);
            if (processed !== '') {
               scoreTempInputs[d] = processed;
            }
          }
        });
        console.log(`[DEBUG diem tam] Tìm thấy ${debugFoundCount} ô input. Kết quả đọc:`, JSON.stringify(scoreTempInputs));

        const rawDiemXuLy = await this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_XU_LY).catch(() => []);
        
        const rowsXuLyForDon = [];
        rawDiemXuLy.forEach((row, idx) => {
          if (row.ma_don === maDon) rowsXuLyForDon.push({ ...row, rowIndex: idx + 2 });
        });

        const xuLyWrites = [];
        const todayStr = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

        assignedDesigners.forEach(d => {
          const newScoreTam = scoreTempInputs[d] || '';
          const existingRow = rowsXuLyForDon.find(r => {
            const t = r.ten_designer || r.designer || r.ho_ten || r.ten || '';
            return t === d;
          });

          if (existingRow) {
            // Chỉ cập nhật nếu có thay đổi
            const oldScoreTam = existingRow.diem_tam || '';
            if (newScoreTam !== oldScoreTam) {
              // Cập nhật Cột C (diem_tam) và Cột D (ngay_ghi_nhan) cho dòng rowIndex
              xuLyWrites.push(this._writeSheet(CONFIG.SHEETS.DIEM_XU_LY, `C${existingRow.rowIndex}:D${existingRow.rowIndex}`, [[newScoreTam, todayStr]]));
            }
          } else {
            // Thêm dòng mới nếu chưa có
            if (newScoreTam !== '') {
              xuLyWrites.push(this._appendSheet(CONFIG.SHEETS.DIEM_XU_LY, [[maDon, d, newScoreTam, todayStr]]));
            }
          }
        });

        if (xuLyWrites.length > 0) {
           await Promise.all(xuLyWrites);
        }

        // Cập nhật local cache điểm tạm
        if (!this._kanbanDiemXuLyMap) this._kanbanDiemXuLyMap = {};
        if (!this._kanbanDiemXuLyMap[maDon]) this._kanbanDiemXuLyMap[maDon] = {};
        assignedDesigners.forEach(d => {
           this._kanbanDiemXuLyMap[maDon][d] = scoreTempInputs[d] || '';
        });
      }
      
      // Build updated don object
      Object.assign(don, patch);

      this._showToast(`✅ Đã lưu thay đổi cho ${maDon}`, 'success', 3000);
      this._renderKanbanBoard(document.getElementById('kb-search-input')?.value || '');
      // Re-render popup to show updated files
      this._openCardDetail(maDon);
    } catch (e) {
      this._showToast('Lỗi lưu: ' + e.message, 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = 'Lưu thay đổi'; }
    }
  },

  async _saveLabels(maDon, newLabels) {
    // Đọc tất cả NHAN_DON thô (không parse header) để giữ lại dữ liệu đơn khác
    const token  = this.session?.accessToken;
    const url    = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.NHAN_DON)}`;
    let allRows  = [];
    let hasHeader = false;
    try {
      const res  = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      allRows    = data.values || [];
      hasHeader  = allRows.length > 0;
    } catch (_) {}

    // Giữ header + lọc bỏ đơn hiện tại
    const header    = hasHeader ? allRows[0] : ['ma_don','nhan','mau'];
    const otherRows = (hasHeader ? allRows.slice(1) : []).filter(r => r[0] !== maDon);
    const newRows   = newLabels.map(l => [maDon, l.nhan, l.mau]);
    const finalData = [header, ...otherRows, ...newRows];

    // Clear sheet rồi ghi lại
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.NHAN_DON)}:clear`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (finalData.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SPREADSHEET_ID}/values/${encodeURIComponent(CONFIG.SHEETS.NHAN_DON + '!A1')}?valueInputOption=USER_ENTERED`,
        {
          method:  'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify({ range: CONFIG.SHEETS.NHAN_DON + '!A1', majorDimension: 'ROWS', values: finalData }),
        }
      );
    }
    // Cập nhật raw cache
    this._kanbanNhanDonRaw = (hasHeader ? allRows.slice(1) : [])
      .filter(r => r[0] !== maDon)
      .concat(newRows)
      .map(r => ({ ma_don: r[0], nhan: r[1], mau: r[2] }));
  },

  _showConfirm(msg, btnOkText, btnCancelText) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'kb-overlay';
      overlay.style.zIndex = '9999';
      overlay.innerHTML = `
        <div class="kb-detail-modal" style="max-width: 400px; padding: 24px; text-align: center;">
          <p style="font-size: 15px; margin-bottom: 24px; color: var(--clr-text); line-height: 1.5; white-space: pre-wrap;">${this._escHtml(msg)}</p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button class="btn btn-ghost" id="btn-cfm-cancel">${this._escHtml(btnCancelText)}</button>
            <button class="btn btn-primary" id="btn-cfm-ok">${this._escHtml(btnOkText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('kb-overlay-visible'));

      const close = (res) => {
        overlay.classList.remove('kb-overlay-visible');
        setTimeout(() => overlay.remove(), 250);
        resolve(res);
      };

      overlay.querySelector('#btn-cfm-ok').onclick = () => close(true);
      overlay.querySelector('#btn-cfm-cancel').onclick = () => close(false);
    });
  },

  _buildProgressBarHtml(label, current, kpi, isCurrency, thuongAmt = 0, isSale = false) {
      if (!kpi) return `<div style="color:#6B6B6B; font-size:13px;">Chưa cấu hình KPI</div>`;
      const pt = current / kpi;
      const ptPercent = Math.min(Math.round(pt * 100), 100);
      const isPass = pt >= 0.8;
      const barColor = isPass ? '#A8C3A0' : (isSale ? '#6B5B95' : '#9C7E5E');
      const bgBar = `<div style="width:100%; height:8px; background:#F5EFE6; border-radius:4px; margin:8px 0; overflow:hidden;"><div style="width:${ptPercent}%; height:100%; background:${barColor}; transition:width 0.3s;"></div></div>`;
      
      const currentStr = isCurrency ? this._formatVND(current) : current;
      const kpiStr = isCurrency ? this._formatVND(kpi) : kpi;
      
      let msg = '';
      if (isPass) {
         msg = `<div style="color:#2A2420; font-size:13px; font-weight:600;">Đã đạt mức thưởng!${thuongAmt > 0 ? ` Lương tạm tính: ${this._formatVND(thuongAmt)}` : ''}</div>`;
      } else {
         const remain = kpi * 0.8 - current;
         const remainStr = isCurrency ? this._formatVND(remain) : Math.ceil(remain * 10) / 10;
         const targetStr = isCurrency ? this._formatVND(kpi * 0.8) : Math.ceil((kpi * 0.8) * 10) / 10;
         msg = `<div style="color:#6B6B6B; font-size:13px;">Cần thêm ${remainStr} nữa để đạt thưởng (80% = ${targetStr})</div>`;
      }
      
      return `
         <div style="display:flex; justify-content:space-between; font-size:14px; color:#2A2420;">
            <span>${label}: <strong>${currentStr}</strong> / ${kpiStr}</span>
            <span style="font-weight:bold; color:${barColor};">${Math.round(pt * 100)}%</span>
         </div>
         ${bgBar}
         ${msg}
      `;
  },

  async _renderProgressNonAdmin(targetMonthYear, yearStr, myRow = {}) {
     const progCont = document.getElementById('bl-progress-container');
     if (!progCont) return;
     
     const role = (this.session?.role || '').toLowerCase();
     const hoTen = (this.session?.ten || this.session?.name || '').trim().toLowerCase();
     const myEmail = (this.session?.email || '').trim().toLowerCase();
     if (!hoTen || (role !== 'sale' && !role.includes('designer'))) {
        return;
     }

     const loaiLuong = (myRow.loai_luong || role).toLowerCase();
     const myKpi = {
        kpi_doanh_so: parseFloat((myRow.kpi_doanh_so || '').toString().replace(/,/g, '')) || 66000000,
        kpi_diem: parseFloat(myRow.kpi_diem) || 65,
        don_gia_diem: parseFloat((myRow.don_gia_diem || '').toString().replace(/,/g, '')) || 500000
     };

     progCont.style.display = 'block';
     progCont.innerHTML = '<div style="color:var(--clr-text-muted); font-size:13px;"><span class="spinner" style="width:12px; height:12px; margin-right:6px; display:inline-block; vertical-align:middle; border-color:var(--clr-accent) transparent transparent transparent; border-width:2px;"></span> Đang tải tiến độ KPI...</div>';

     let html = '';
     if (loaiLuong === 'sale') {
        const [donHangList] = await Promise.all([
           this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG)
        ]);
        
        const saleOrders = donHangList.filter(d => {
           if ((d.sale_phu_trach || '').trim().toLowerCase() !== hoTen) return false;
           const tt = (d.trang_thai || '').toLowerCase();
           if (tt.includes('hủy') || tt.includes('huy')) return false;
           const ngayThuDu = (d.ngay_thu_du || '').trim();
           if (!ngayThuDu) return false;
           const parts = ngayThuDu.split('/');
           if (parts.length >= 2) {
              const mm = parts[1];
              const yyyy = parts.length === 3 ? parts[2] : yearStr; 
              if (`${mm}/${yyyy}` !== targetMonthYear) return false;
              return true;
           }
           return false;
        });

        const totalRevenue = saleOrders.reduce((sum, d) => sum + this._tinhSoPhaiThu(d), 0);
        const kpi = myKpi.kpi_doanh_so || 66000000;
        
        html = this._buildProgressBarHtml('Doanh số tháng này', totalRevenue, kpi, true, 0, true);

     } else if (loaiLuong === 'designer_hieu_suat') {
        const [donHangList, diemList] = await Promise.all([
           this._readSheet(this.session.accessToken, CONFIG.SHEETS.DON_HANG),
           this._readSheet(this.session.accessToken, CONFIG.SHEETS.DIEM_DESIGNER)
        ]);
        const donHangMap = {};
        donHangList.forEach(d => donHangMap[d.ma_don] = d);
        
        const myDiemList = diemList.filter(diem => {
           if ((diem.ten_designer || '').trim().toLowerCase() !== hoTen) return false;
           const don = donHangMap[diem.ma_don];
           if (!don) return false;
           const ngayDuyet = (don.ngay_duyet_mau || '').trim();
           if (!ngayDuyet) return false;
           const parts = ngayDuyet.split('/');
           if (parts.length >= 2) {
              const mm = parts[1];
              const yyyy = parts.length === 3 ? parts[2] : yearStr;
              return `${mm}/${yyyy}` === targetMonthYear;
           }
           return false;
        });

        const totalDiem = myDiemList.reduce((sum, d) => sum + parseFloat(d.diem || 0), 0);
        const kpi = myKpi.kpi_diem || 65;
        
        let luongHieuSuat = 0;
        if (kpi > 0) {
           const ptHieuSuat = totalDiem / kpi;
           if (ptHieuSuat >= 0.8) {
              const donGia = myKpi.don_gia_diem || 500000;
              luongHieuSuat = 0.04 * donGia * ptHieuSuat * totalDiem;
           }
        }
        
        html = this._buildProgressBarHtml('Điểm tháng này', totalDiem, kpi, false, luongHieuSuat);
     } else if (loaiLuong === 'designer_co_ban') {
        progCont.innerHTML = `<div style="background:var(--clr-bg); padding:16px; border-radius:8px; border:1px solid var(--clr-border);">
           <div style="font-weight:600; font-size:14px; color:var(--clr-text); margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Tiến độ KPI của bạn</div>
           <div style="padding:12px; font-size:14px; color:var(--clr-text); background:var(--clr-surface); border-radius:8px; border:1px dashed var(--clr-border);">Lương của bạn: lương cơ bản + thưởng riêng (nếu có)</div>
        </div>`;
        progCont.style.display = 'block';
        return; // Thoát sớm để không chạy phần if (html) bên dưới
     }

     if (html) {
        progCont.innerHTML = `<div style="background:var(--clr-bg); padding:16px; border-radius:8px; border:1px solid var(--clr-border);">
           <div style="font-weight:600; font-size:14px; color:var(--clr-text); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.5px;">Tiến độ KPI của bạn</div>
           ${html}
        </div>`;
     } else {
        progCont.style.display = 'none';
     }
  },

  /**
   * Sinh ID duy nhất cho mỗi giao dịch tiền (VD: GD1712345678-83)
   * Định dạng: GD + timestamp mili-giây + "-" + số ngẫu nhiên (hoặc tham số truyền vào).
   */
  _taoIdGiaoDich(suffix = null) {
     const rand = suffix !== null ? suffix : Math.floor(Math.random() * 10000);
     return 'GD' + Date.now() + '-' + rand;
  },

  /**
   * HÀM TIỆN ÍCH: Chạy 1 lần bằng Console (gõ App._backfillIdGiaoDich())
   * Mục đích: Quét sheet GIAO_DICH_TIEN, sinh ID duy nhất cho các dòng chưa có ở cột F.
   */
  async _backfillIdGiaoDich() {
    try {
      console.log('Bắt đầu backfill ID giao dịch...');
      const token = this.session?.accessToken;
      if (!token) {
        console.error('Chưa đăng nhập!');
        alert('Chưa đăng nhập! Vui lòng đăng nhập lại.');
        return;
      }
      
      const targetSpreadsheetId = this._getSpreadsheetIdFor(CONFIG.SHEETS.GIAO_DICH_TIEN);
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(CONFIG.SHEETS.GIAO_DICH_TIEN)}`;
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Không thể đọc GIAO_DICH_TIEN');
      
      const dataObj = await res.json();
      const rows = dataObj.values || [];
      if (rows.length === 0) {
        console.log('Sheet trống!');
        return;
      }
      
      const headers = rows[0];
      // 1. Kiểm tra header cột F (index 5)
      if (headers[5] !== 'id_giao_dich') {
         await this._writeSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, 'F1', [['id_giao_dich']]);
         console.log('Đã tạo header id_giao_dich ở F1');
      }
      
      // 2. Quét từng dòng data (từ index 1)
      let count = 0;
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const currentId = row[5] ? String(row[5]).trim() : '';
        
        if (!currentId) {
           const newId = this._taoIdGiaoDich(i + 1);
           const sheetRow = i + 1; // sheet bắt đầu từ 1, dòng i là index thứ i trong array (tương ứng dòng i+1 trong sheet)
           await this._writeSheet(CONFIG.SHEETS.GIAO_DICH_TIEN, `F${sheetRow}`, [[newId]]);
           count++;
           // Đợi 250ms để không bị Google đánh rate limit (lỗi 429 quá nhiều request)
           await new Promise(r => setTimeout(r, 250));
        }
      }
      
      console.log(`Đã hoàn tất! Đã gán ID cho ${count} dòng giao dịch.`);
      alert(`Đã gán ID thành công cho ${count} dòng giao dịch!`);
    } catch (err) {
      console.error('Lỗi khi backfill ID giao dịch:', err);
      alert('Có lỗi xảy ra: ' + err.message);
    }
  }

};



// ──────────────────────────────────────────────────────────
// BOOTSTRAP — Chờ DOM + GSI script cùng sẵn sàng
// ──────────────────────────────────────────────────────────
(function bootstrap() {
  let domReady = false;
  let gsiReady = false;

  function tryInit() {
    if (domReady && gsiReady) { App.init(); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { domReady = true; tryInit(); });
  } else {
    domReady = true;
  }

  function waitForGSI() {
    if (typeof google !== 'undefined' && google?.accounts?.oauth2) { gsiReady = true; tryInit(); }
    else { setTimeout(waitForGSI, 150); }
  }
  waitForGSI();
})();


// ============================================================
// HÀM RIÊNG BIỆT: taoThongBaoChat
// ============================================================
// Tạo nội dung thông báo để gửi lên Google Chat.
// Tách riêng để dễ nâng cấp gửi tự động sau này.
//
// @param {string} ma_don   - Mã đơn hàng (VD: DON-0001)
// @param {string} link_the - Link tới thẻ Kanban của đơn
// @returns {string}        - Chuỗi thông báo sẵn sàng gửi lên Chat
// ============================================================
function taoThongBaoChat(ma_don, link_the) {
  return `📋 Đơn mới: ${ma_don} — ${link_the}`;
}

