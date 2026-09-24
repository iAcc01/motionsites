/* ==========================================================================
   Prompt Library — 应用逻辑
   数据完全存储于 localStorage，不依赖任何后端或 CDN
   ========================================================================== */
(function () {
  "use strict";

  var STORE_KEY = "prompt-library:v1";
  var PREF_KEY = "prompt-library:prefs:v1";

  /* ------------------------------------------------------------------------
     示例数据来自 seed-data.js（window.SEED_DATA）
     仅在本地无数据、或本地数据仍是未经修改的旧版示例时写入，
     绝不覆盖用户自己新增或编辑过的内容。
     ------------------------------------------------------------------------ */
  var SEED = window.SEED_DATA || [];

  /* 旧版示例的标题清单：用于识别「用户从未改动过示例数据」的情况 */
  var LEGACY_SEED_TITLES = [
    "暗色 3D 玻璃拟态首屏",
    "渐变噪点背景生成器",
    "瀑布流作品集网格",
    "分段式筛选器控件",
    "一键复制交互反馈",
    "SaaS 定价区块",
    "页脚大字标语区",
    "空状态插画区块",
  ];

  /* ------------------------------------------------------------------------
     工具函数
     ------------------------------------------------------------------------ */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function hashOf(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = (h << 5) - h + str.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }

  function $(sel) {
    return document.querySelector(sel);
  }

  /* 依据标题生成稳定的渐变封面。
     无缝拼贴（gap 2px）下相邻封面直接相接，高饱和亮色会互相碰撞，
     故压低饱和与亮度、收窄色相跨度，模拟真实图片的低饱和暗调层次。 */
  function coverStyle(title) {
    var h = hashOf(title);
    var a = h % 360;
    var b = (a + 20 + (h % 40)) % 360;
    var c = (a + 300 + (h % 40)) % 360;
    return (
      "background-image:radial-gradient(95% 125% at " +
      (25 + (h % 50)) +
      "% " +
      (18 + (h % 40)) +
      "%, hsl(" +
      a +
      " 42% 44%) 0%, hsl(" +
      b +
      " 38% 26%) 48%, hsl(" +
      c +
      " 34% 13%) 100%)"
    );
  }

  /* ------------------------------------------------------------------------
     数据层
     ------------------------------------------------------------------------ */
  var items = [];
  var prefs = {
    sort: "recent",
    category: "All",
    favOnly: false,
    query: "",
    theme: null, // null = 跟随系统；"dark" / "light" = 用户已手动指定
  };

  function loadData() {
    var raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (e) {
      raw = null;
    }

    if (raw === null) {
      items = buildSeed();
      saveData();
      return;
    }

    try {
      var parsed = JSON.parse(raw);
      items = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      items = [];
      toast("本地数据解析失败，已按空库启动（原数据未删除）");
      return;
    }

    // 若本地内容仍是未经改动的旧版示例，则升级为新示例；
    // 只要用户新增或编辑过任意一条，就完整保留，不做任何替换。
    if (items.length && isPristineLegacySeed(items) && SEED.length) {
      items = buildSeed();
      saveData();
    }
  }

  function buildSeed() {
    return SEED.map(function (s, i) {
      return {
        id: uid() + i,
        title: s.title,
        category: s.category,
        tags: s.tags || [],
        body: s.body,
        image: s.image || "",
        width: s.width || 0,
        height: s.height || 0,
        model: s.model || "",
        author: s.author || null,
        source: s.source || "",
        likes: s.likes || 0,
        favorite: false,
        createdAt: Date.now() - (SEED.length - i) * 60000,
      };
    });
  }

  function isPristineLegacySeed(list) {
    if (list.length !== LEGACY_SEED_TITLES.length) return false;
    return list.every(function (it) {
      return LEGACY_SEED_TITLES.indexOf(it.title) !== -1;
    });
  }

  function saveData() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(items));
    } catch (e) {
      toast("保存失败：本地存储空间不足");
    }
  }

  function loadPrefs() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && typeof p === "object") {
          prefs.sort = p.sort || "recent";
          prefs.category = p.category || "All";
          prefs.favOnly = !!p.favOnly;
          prefs.theme =
            p.theme === "dark" || p.theme === "light" ? p.theme : null;
        }
      }
    } catch (e) {
      /* 忽略，用默认值 */
    }
  }

  function savePrefs() {
    try {
      localStorage.setItem(
        PREF_KEY,
        JSON.stringify({
          sort: prefs.sort,
          category: prefs.category,
          favOnly: prefs.favOnly,
          theme: prefs.theme,
        }),
      );
    } catch (e) {
      /* 忽略 */
    }
  }

  /* ------------------------------------------------------------------------
     主题
     首次访问跟随系统偏好并持续监听；用户手动切换后固定，不再跟随。
     ------------------------------------------------------------------------ */
  function systemTheme() {
    return window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }

  function effectiveTheme() {
    return prefs.theme || systemTheme();
  }

  function applyTheme(theme, animate) {
    var root = document.documentElement;

    if (animate) {
      root.classList.add("theming");
      setTimeout(function () {
        root.classList.remove("theming");
      }, 240);
    }

    root.setAttribute("data-theme", theme);

    var btn = $("#btnTheme");
    if (btn) {
      var next = theme === "dark" ? "浅色" : "深色";
      btn.setAttribute("aria-label", "切换到" + next + "主题");
      btn.setAttribute("title", "切换到" + next + "主题");
    }
  }

  function watchSystemTheme() {
    if (!window.matchMedia) return;
    var mq = window.matchMedia("(prefers-color-scheme: light)");
    var handler = function () {
      // 仅在用户未手动指定时跟随系统
      if (!prefs.theme) applyTheme(systemTheme(), true);
    };
    if (mq.addEventListener) mq.addEventListener("change", handler);
    else if (mq.addListener) mq.addListener(handler);
  }

  /* ------------------------------------------------------------------------
     下拉浮层
     ------------------------------------------------------------------------ */
  function closeDropdowns() {
    document.querySelectorAll(".dropdown.is-open").forEach(function (d) {
      d.classList.remove("is-open");
      var t = d.querySelector("[aria-expanded]");
      if (t) t.setAttribute("aria-expanded", "false");
    });
  }

  function toggleDropdown(id) {
    var d = $("#" + id);
    var open = d.classList.contains("is-open");
    closeDropdowns();
    if (!open) {
      d.classList.add("is-open");
      var t = d.querySelector("[aria-expanded]");
      if (t) t.setAttribute("aria-expanded", "true");
    }
  }

  /* 收藏筛选生效时，在筛选按钮上显示小圆点（关键词已在导航搜索框中可见） */
  function updateFilterDot() {
    $("#filtersDot").hidden = !prefs.favOnly;
  }

  /* ------------------------------------------------------------------------
     Toast
     ------------------------------------------------------------------------ */
  function toast(msg) {
    var box = $("#toasts");
    var li = document.createElement("li");
    li.className = "toast";
    li.textContent = msg;
    box.appendChild(li);
    setTimeout(function () {
      li.style.transition = "opacity .25s ease, transform .25s ease";
      li.style.opacity = "0";
      li.style.transform = "translateY(8px)";
      setTimeout(function () {
        li.remove();
      }, 260);
    }, 2200);
  }

  /* ------------------------------------------------------------------------
     复制
     ------------------------------------------------------------------------ */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e) {
        ok = false;
      }
      ta.remove();
      ok ? resolve() : reject(new Error("copy failed"));
    });
  }

  /* ------------------------------------------------------------------------
     筛选 / 排序
     ------------------------------------------------------------------------ */
  function categories() {
    var map = Object.create(null);
    items.forEach(function (it) {
      var c = (it.category || "未分类").trim() || "未分类";
      map[c] = (map[c] || 0) + 1;
    });
    return Object.keys(map)
      .sort()
      .map(function (name) {
        return { name: name, count: map[name] };
      });
  }

  function visibleItems() {
    var q = prefs.query.trim().toLowerCase();

    var list = items.filter(function (it) {
      if (prefs.favOnly && !it.favorite) return false;

      if (prefs.category !== "All") {
        var c = (it.category || "未分类").trim() || "未分类";
        if (c !== prefs.category) return false;
      }

      if (q) {
        var hay = (
          it.title +
          " " +
          (it.category || "") +
          " " +
          (it.tags || []).join(" ") +
          " " +
          it.body
        ).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });

    if (prefs.sort === "recent") {
      list.sort(function (a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    } else if (prefs.sort === "title") {
      list.sort(function (a, b) {
        return a.title.localeCompare(b.title, "zh-Hans-CN");
      });
    } else if (prefs.sort === "category") {
      list.sort(function (a, b) {
        return (a.category || "").localeCompare(b.category || "", "zh-Hans-CN");
      });
    }
    return list;
  }

  /* ------------------------------------------------------------------------
     渲染：分类 tab
     ------------------------------------------------------------------------ */
  function renderFilters() {
    var box = $("#filters");
    var cats = categories();
    var all = [{ name: "All", count: items.length }].concat(cats);

    box.innerHTML = all
      .map(function (c) {
        var active = prefs.category === c.name;
        return (
          '<li><button class="tab' +
          (active ? " is-active" : "") +
          '" role="tab" aria-selected="' +
          active +
          '" data-cat="' +
          escapeHtml(c.name) +
          '">' +
          escapeHtml(c.name === "All" ? "全部" : c.name) +
          "</button></li>"
        );
      })
      .join("");

    var dl = $("#categoryList");
    dl.innerHTML = cats
      .map(function (c) {
        return '<option value="' + escapeHtml(c.name) + '"></option>';
      })
      .join("");

    updateScrollArrows();
  }

  /* 溢出时显示两端箭头，到边界即隐藏（对应 Dribbble 的 .d-none 行为） */
  function updateScrollArrows() {
    var ul = $("#filters");
    var back = document.querySelector(".scroll--back button");
    var fwd = document.querySelector(".scroll--fwd button");
    if (!ul || !back || !fwd) return;

    var overflowing = ul.scrollWidth > ul.clientWidth + 1;
    var atStart = ul.scrollLeft <= 1;
    var atEnd = ul.scrollLeft + ul.clientWidth >= ul.scrollWidth - 1;

    back.classList.toggle("is-hidden", !overflowing || atStart);
    fwd.classList.toggle("is-hidden", !overflowing || atEnd);
  }

  /* ------------------------------------------------------------------------
     渲染：瀑布流
     ------------------------------------------------------------------------ */
  /* 列数：以即梦的 287px 列宽 + 2px 间距为基准。
     两个约束共同作用——
     上限：卡片较少时收窄列数，避免每列只有一两张而参差；
     下限：保证单卡不超过 420px，避免宽屏少数据时卡片被拉得过大。 */
  var COL_W = 289; // 287 列宽 + 2 间距
  var CARD_MAX_W = 420;

  function columnCount(total) {
    var grid = $("#grid");
    var w = grid ? grid.clientWidth : window.innerWidth;
    var byWidth = Math.max(1, Math.round((w + 2) / COL_W));
    if (!total) return byWidth;
    var maxCols = Math.ceil(total / 2);
    var minCols = Math.ceil(w / CARD_MAX_W);
    return Math.max(
      1,
      Math.min(byWidth, Math.max(minCols, Math.min(byWidth, maxCols))),
    );
  }

  /* 卡片高度取图片真实比例；无图或无尺寸时按 id 稳定散列分配，
     保证瀑布流错落且刷新不跳变。 */
  var RATIOS = [
    { css: "16 / 9", h: 9 / 16 },
    { css: "4 / 3", h: 3 / 4 },
    { css: "1 / 1", h: 1 },
    { css: "3 / 4", h: 4 / 3 },
    { css: "2 / 3", h: 3 / 2 },
    { css: "9 / 16", h: 16 / 9 },
  ];

  function ratioOf(it) {
    if (it.width > 0 && it.height > 0) {
      return { css: it.width + " / " + it.height, h: it.height / it.width };
    }
    return RATIOS[hashOf(it.id + it.title) % RATIOS.length];
  }

  function cardHtml(it, i) {
    var media = it.image
      ? '<div class="card__skeleton"></div><img class="card__img" src="' +
        escapeHtml(it.image) +
        '" alt="" loading="lazy" decoding="async" />'
      : '<div class="card__cover" style="' +
        coverStyle(it.title) +
        '"><span class="card__cover-glyph">' +
        escapeHtml(it.title.trim().charAt(0) || "P") +
        '</span></div><div class="card__noise" aria-hidden="true"></div>';

    return (
      '<article class="card" data-id="' +
      it.id +
      '" tabindex="0" role="button" aria-label="查看 ' +
      escapeHtml(it.title) +
      '" style="aspect-ratio:' +
      ratioOf(it).css +
      ";animation-delay:" +
      Math.min(i * 30, 400) +
      'ms">' +
      media +
      // 底部渐变 + 信息条，hover 时淡入（即梦 .gradient / .overlay）
      '<div class="card__scrim" aria-hidden="true"></div>' +
      '<div class="card__overlay">' +
      '<div class="card__meta">' +
      '<h3 class="card__title">' +
      escapeHtml(it.title) +
      "</h3>" +
      '<span class="card__category">' +
      escapeHtml(it.category || "未分类") +
      "</span>" +
      "</div>" +
      '<div class="card__tools">' +
      '<button class="card__act" data-copy="' +
      it.id +
      '" type="button" aria-label="复制 Prompt">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A3.5 3.5 0 0 0 3 6.5v6A2.5 2.5 0 0 0 5.5 15"/></svg>' +
      "</button>" +
      '<button class="card__act' +
      (it.favorite ? " is-on" : "") +
      '" data-fav="' +
      it.id +
      '" type="button" aria-label="收藏" aria-pressed="' +
      !!it.favorite +
      '">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="' +
      (it.favorite ? "currentColor" : "none") +
      '" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 4 2.4 5.1 5.6.7-4.1 3.9 1 5.5-4.9-2.7-4.9 2.7 1-5.5L4 9.8l5.6-.7z"/></svg>' +
      "</button>" +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderGrid() {
    var grid = $("#grid");
    var list = visibleItems();

    if (!list.length) {
      grid.innerHTML = "";
      return;
    }

    var cols = columnCount(list.length);
    var buckets = [];
    var heights = [];
    for (var c = 0; c < cols; c++) {
      buckets.push([]);
      heights.push(0);
    }

    // 最短列优先：卡片比例已知，可精确预估相对高度，避免各列高度悬殊
    list.forEach(function (it, i) {
      var target = 0;
      for (var c = 1; c < cols; c++) {
        if (heights[c] < heights[target]) target = c;
      }
      buckets[target].push(cardHtml(it, i));
      heights[target] += ratioOf(it).h;
    });

    grid.innerHTML = buckets
      .map(function (b) {
        return '<div class="masonry__col">' + b.join("") + "</div>";
      })
      .join("");

    // 图片加载完成后淡入
    grid.querySelectorAll(".card__img").forEach(function (img) {
      if (img.complete && img.naturalWidth) {
        img.classList.add("is-loaded");
      } else {
        img.addEventListener("load", function () {
          img.classList.add("is-loaded");
          // 旧数据缺尺寸：按图片原始尺寸补齐，当次即修正卡片比例，
          // 下次整体渲染时瀑布流按真实比例重新分列
          var card = img.closest(".card");
          var it = card && findItem(card.getAttribute("data-id"));
          if (it && !(it.width > 0 && it.height > 0) && img.naturalWidth > 0) {
            it.width = img.naturalWidth;
            it.height = img.naturalHeight;
            saveData();
            card.style.aspectRatio = it.width + " / " + it.height;
          }
        });
        // 加载失败（外链失效/防盗链）：降级为标题生成的渐变封面
        img.addEventListener("error", function () {
          var card = img.closest(".card");
          var it = card && findItem(card.getAttribute("data-id"));
          img.remove();
          var sk = card && card.querySelector(".card__skeleton");
          if (sk) sk.remove();
          if (!card || !it) return;
          card.insertAdjacentHTML(
            "afterbegin",
            '<div class="card__cover" style="' +
              coverStyle(it.title) +
              '"><span class="card__cover-glyph">' +
              escapeHtml(it.title.trim().charAt(0) || "P") +
              '</span></div><div class="card__noise" aria-hidden="true"></div>',
          );
        });
      }
    });
  }

  function renderAll() {
    renderFilters();
    renderGrid();
  }

  /* 就地更新卡片收藏图标状态，避免整列重渲染造成页面闪烁 */
  function setCardFav(btn, on) {
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.querySelector("svg").setAttribute("fill", on ? "currentColor" : "none");
  }

  /* ------------------------------------------------------------------------
     弹层
     ------------------------------------------------------------------------ */
  var currentId = null;
  var editingId = null;
  var lastFocus = null;
  /* 编辑表单图片状态：local 为本地上传（dataURL + 已测尺寸），
     urlW/urlH 为链接图片最近一次成功测量的尺寸 */
  var editImage = { local: null, urlW: 0, urlH: 0 };
  var saving = false;

  function openOverlay(id) {
    lastFocus = document.activeElement;
    $("#" + id).hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeOverlay(id) {
    $("#" + id).hidden = true;
    if ($("#detailOverlay").hidden && $("#editOverlay").hidden) {
      document.body.style.overflow = "";
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function findItem(id) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  function openDetail(id) {
    var it = findItem(id);
    if (!it) return;
    currentId = id;

    // ---- 左侧图片舞台 ----
    $("#stageFigure").innerHTML = it.image
      ? '<img src="' +
        escapeHtml(it.image) +
        '" alt="' +
        escapeHtml(it.title) +
        '" decoding="async" />'
      : '<div class="stage__placeholder" style="' +
        coverStyle(it.title) +
        '"><span>' +
        escapeHtml(it.title.trim().charAt(0) || "P") +
        "</span></div>";

    // 舞台大图加载失败时同样降级为渐变占位
    var stageImg = $("#stageFigure").querySelector("img");
    if (stageImg) {
      stageImg.addEventListener("error", function () {
        $("#stageFigure").innerHTML =
          '<div class="stage__placeholder" style="' +
          coverStyle(it.title) +
          '"><span>' +
          escapeHtml(it.title.trim().charAt(0) || "P") +
          "</span></div>";
      });
    }

    // ---- 作者 ----
    var a = it.author;
    $("#detailAuthor").innerHTML = a
      ? (a.avatar
          ? '<img class="byline__avatar" src="' +
            escapeHtml(a.avatar) +
            '" alt="" loading="lazy" />'
          : '<span class="byline__avatar"></span>') +
        '<span style="min-width:0">' +
        '<span class="byline__name">' +
        escapeHtml(a.name || "匿名") +
        "</span>" +
        (a.username
          ? '<span class="byline__handle">@' +
            escapeHtml(a.username) +
            "</span>"
          : "") +
        "</span>"
      : '<span style="min-width:0"><span class="byline__name">' +
        escapeHtml(it.title) +
        '</span><span class="byline__handle">' +
        (it.category || "未分类") +
        "</span></span>";

    var model = $("#detailModel");
    model.textContent = it.model || "";
    model.hidden = !it.model;

    var likes = $("#detailLikes");
    likes.querySelector("b").textContent = it.likes || 0;
    likes.hidden = !it.likes;

    // ---- 收藏态 ----
    var favBtn = $("#btnFavDetail");
    favBtn.classList.toggle("is-on", !!it.favorite);
    favBtn.setAttribute("aria-pressed", String(!!it.favorite));
    favBtn.querySelector("span").textContent = it.favorite ? "已收藏" : "收藏";

    // ---- 删除按钮复位（清除上一条可能残留的待确认态） ----
    var delBtn = $("#btnDelete");
    delBtn.classList.remove("is-armed");
    delBtn.textContent = "删除";

    // ---- 提示词（超长时折叠） ----
    var body = $("#detailBody");
    body.textContent = it.body;
    body.classList.add("is-clamped");

    var expand = $("#btnExpand");
    expand.textContent = "展开";
    // 折叠 6 行约 220 字，短内容无需展开按钮
    expand.hidden = it.body.length < 220;

    // ---- 元信息 ----
    var rows = [
      ["分类", escapeHtml(it.category || "未分类")],
      ["字数", it.body.length + " 字"],
    ];
    if (it.width && it.height) {
      rows.push(["尺寸", it.width + " × " + it.height]);
    }
    rows.push([
      "加入时间",
      new Date(it.createdAt || Date.now()).toLocaleDateString("zh-CN"),
    ]);
    if (it.source) {
      rows.push([
        "来源",
        '<a href="' +
          escapeHtml(it.source) +
          '" target="_blank" rel="noopener noreferrer">查看原帖</a>',
      ]);
    }
    $("#detailMeta").innerHTML = rows
      .map(function (r) {
        return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>";
      })
      .join("");

    // ---- 标签 ----
    $("#detailTags").innerHTML = (it.tags || [])
      .map(function (t) {
        return '<span class="tag">#' + escapeHtml(t) + "</span>";
      })
      .join("");

    // ---- 相关推荐：同分类的其他条目 ----
    var related = items
      .filter(function (x) {
        return x.id !== it.id && x.category === it.category;
      })
      .slice(0, 4);
    var relSec = $("#relatedSec");
    relSec.hidden = !related.length;
    $("#relatedGrid").innerHTML = related
      .map(function (x) {
        var inner = x.image
          ? '<img src="' +
            escapeHtml(x.image) +
            '" alt="' +
            escapeHtml(x.title) +
            '" loading="lazy" />'
          : '<div style="position:absolute;inset:0;' +
            coverStyle(x.title) +
            '"></div>';
        return (
          '<div class="related__item" data-rel="' +
          x.id +
          '" role="button" tabindex="0" title="' +
          escapeHtml(x.title) +
          '">' +
          inner +
          "</div>"
        );
      })
      .join("");

    // 相关推荐缩略图加载失败时降级为渐变占位
    $("#relatedGrid").querySelectorAll("img").forEach(function (img) {
      img.addEventListener("error", function () {
        var el = img.closest("[data-rel]");
        var x = el && findItem(el.getAttribute("data-rel"));
        img.remove();
        if (el && x) {
          el.insertAdjacentHTML(
            "afterbegin",
            '<div style="position:absolute;inset:0;' +
              coverStyle(x.title) +
              '"></div>',
          );
        }
      });
    });

    // ---- 源链接按钮 ----
    $("#btnOpenSource").hidden = !it.source;
    $("#btnDownload").hidden = !it.image;

    openOverlay("detailOverlay");
    $("#btnCopyDetail").focus();
  }

  /* 测量图片原始尺寸；加载失败或超时（4s）回退 0×0（渲染时按散列比例） */
  function measureImage(src, cb) {
    var done = false;
    var timer = setTimeout(function () {
      finish(0, 0);
    }, 4000);
    function finish(w, h) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cb(w, h);
    }
    var img = new Image();
    img.onload = function () {
      finish(img.naturalWidth, img.naturalHeight);
    };
    img.onerror = function () {
      finish(0, 0);
    };
    img.src = src;
  }

  function setImagePreview(src, meta) {
    var box = $("#fImagePreview");
    if (!src) {
      box.hidden = true;
      return;
    }
    $("#fImagePreviewImg").src = src;
    $("#fImagePreviewMeta").textContent = meta || "";
    box.hidden = false;
  }

  /* 链接输入变化：异步测量尺寸并显示预览 */
  function probeUrlImage() {
    var url = $("#fImage").value.trim();
    editImage.urlW = 0;
    editImage.urlH = 0;
    if (!url || url.indexOf("data:") === 0) {
      if (!editImage.local) setImagePreview(null);
      return;
    }
    measureImage(url, function (w, h) {
      // 期间用户可能已改地址或改选本地图，仅当输入未变时才采用
      if (editImage.local || $("#fImage").value.trim() !== url) return;
      if (w) {
        editImage.urlW = w;
        editImage.urlH = h;
        setImagePreview(url, w + " × " + h);
      } else {
        setImagePreview(null);
      }
    });
  }

  function clearEditImage() {
    editImage.local = null;
    editImage.urlW = 0;
    editImage.urlH = 0;
    $("#fImage").value = "";
    $("#fImageRow").hidden = false;
    setImagePreview(null);
  }

  /* 本地图片：读取为 dataURL，最长边超过 1600 或体积过大时重编码为 JPEG，
     控制 localStorage 占用；透底图铺白底（JPEG 无透明通道） */
  function readLocalImage(file) {
    if (!file.type || file.type.indexOf("image/") !== 0) {
      toast("请选择图片文件");
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      toast("图片读取失败");
    };
    reader.onload = function () {
      var dataUrl = String(reader.result);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        var scale = Math.min(1, 1600 / Math.max(w, h));
        var dw = Math.round(w * scale);
        var dh = Math.round(h * scale);
        var src = dataUrl;
        if (scale < 1 || file.size > 512 * 1024) {
          var cv = document.createElement("canvas");
          cv.width = dw;
          cv.height = dh;
          var ctx = cv.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, dw, dh);
          ctx.drawImage(img, 0, 0, dw, dh);
          src = cv.toDataURL("image/jpeg", 0.85);
        }
        editImage.local = { src: src, width: dw, height: dh, name: file.name };
        editImage.urlW = 0;
        editImage.urlH = 0;
        $("#fImage").value = "";
        $("#fImageRow").hidden = true;
        setImagePreview(src, file.name + " · " + dw + " × " + dh);
      };
      img.onerror = function () {
        toast("图片读取失败");
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function openEdit(id) {
    editingId = id || null;
    var it = id ? findItem(id) : null;

    $("#editTitle").textContent = it ? "编辑 Prompt" : "新建 Prompt";
    $("#fTitle").value = it ? it.title : "";
    $("#fCategory").value = it ? it.category || "" : "";
    $("#fTags").value = it ? (it.tags || []).join(", ") : "";
    $("#fBody").value = it ? it.body : "";

    // 图片：本地图（dataURL）进入预览态，链接图进入输入框并异步测量尺寸
    editImage.local = null;
    editImage.urlW = 0;
    editImage.urlH = 0;
    saving = false;
    var img = it ? it.image || "" : "";
    if (img.indexOf("data:") === 0) {
      editImage.local = {
        src: img,
        width: it.width || 0,
        height: it.height || 0,
        name: "本地图片",
      };
      $("#fImage").value = "";
      $("#fImageRow").hidden = true;
      setImagePreview(
        img,
        it.width && it.height
          ? "本地图片 · " + it.width + " × " + it.height
          : "本地图片",
      );
    } else {
      $("#fImage").value = img;
      $("#fImageRow").hidden = false;
      setImagePreview(null);
      if (img) {
        if (it.width && it.height) {
          editImage.urlW = it.width;
          editImage.urlH = it.height;
          setImagePreview(img, it.width + " × " + it.height);
        }
        probeUrlImage();
      }
    }

    openOverlay("editOverlay");
    $("#fTitle").focus();
  }

  function saveEdit() {
    if (saving) return;
    var title = $("#fTitle").value.trim();
    var body = $("#fBody").value.trim();

    if (!title) {
      toast("请填写标题");
      $("#fTitle").focus();
      return;
    }
    if (!body) {
      toast("请填写 Prompt 内容");
      $("#fBody").focus();
      return;
    }

    var tags = $("#fTags")
      .value.split(/[,，]/)
      .map(function (t) {
        return t.trim();
      })
      .filter(Boolean);

    var payload = {
      title: title,
      category: $("#fCategory").value.trim() || "未分类",
      tags: tags,
      body: body,
    };

    saving = true;
    if (editImage.local) {
      persistEdit(
        payload,
        editImage.local.src,
        editImage.local.width,
        editImage.local.height,
      );
    } else {
      var url = $("#fImage").value.trim();
      if (url && editImage.urlW) {
        persistEdit(payload, url, editImage.urlW, editImage.urlH);
      } else if (url) {
        // 粘贴后立即保存、尚未测量：先测尺寸再落库，保证列表按原始比例显示
        measureImage(url, function (w, h) {
          persistEdit(payload, url, w, h);
        });
      } else {
        persistEdit(payload, "", 0, 0);
      }
    }
  }

  function persistEdit(payload, image, w, h) {
    if (editingId) {
      var it = findItem(editingId);
      if (it) {
        it.title = payload.title;
        it.category = payload.category;
        it.tags = payload.tags;
        it.body = payload.body;
        if (it.image !== image) {
          // 换图：以新图的实测尺寸为准
          it.image = image;
          it.width = w;
          it.height = h;
        } else if (w && !(it.width > 0 && it.height > 0)) {
          // 同一张图但此前缺尺寸：补齐
          it.width = w;
          it.height = h;
        }
      }
      toast("已更新");
    } else {
      items.push({
        id: uid(),
        title: payload.title,
        category: payload.category,
        tags: payload.tags,
        image: image,
        width: w,
        height: h,
        body: payload.body,
        favorite: false,
        createdAt: Date.now(),
      });
      toast("已新建");
    }

    saving = false;
    saveData();
    renderAll();
    closeOverlay("editOverlay");
    editingId = null;
  }

  /* ------------------------------------------------------------------------
     导入 / 导出
     ------------------------------------------------------------------------ */
  function exportData() {
    if (!items.length) {
      toast("暂无数据可导出");
      return;
    }
    var blob = new Blob([JSON.stringify(items, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download =
      "prompt-library-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    URL.revokeObjectURL(url);
    toast("已导出 " + items.length + " 条");
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try {
        incoming = JSON.parse(String(reader.result));
      } catch (e) {
        toast("文件不是合法 JSON");
        return;
      }
      if (!Array.isArray(incoming)) {
        toast("文件格式不正确：应为数组");
        return;
      }

      // 合并策略：以 id 去重，已存在的保留本地版本，不覆盖用户现有数据
      var existing = Object.create(null);
      items.forEach(function (it) {
        existing[it.id] = true;
      });

      var added = 0;
      incoming.forEach(function (raw) {
        if (!raw || typeof raw !== "object") return;
        if (!raw.title || !raw.body) return;
        var id = raw.id && !existing[raw.id] ? raw.id : uid();
        if (existing[id]) return;
        existing[id] = true;
        items.push({
          id: id,
          title: String(raw.title),
          category: String(raw.category || "未分类"),
          tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
          image: String(raw.image || ""),
          body: String(raw.body),
          width: Number(raw.width) || 0,
          height: Number(raw.height) || 0,
          model: String(raw.model || ""),
          author:
            raw.author && typeof raw.author === "object" ? raw.author : null,
          source: String(raw.source || ""),
          likes: Number(raw.likes) || 0,
          favorite: !!raw.favorite,
          createdAt: Number(raw.createdAt) || Date.now(),
        });
        added++;
      });

      saveData();
      renderAll();
      toast(
        added ? "已导入 " + added + " 条（未覆盖原有数据）" : "没有新增条目",
      );
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------------------ */
  function bind() {
    // 通知铃铛（无通知体系，仅反馈）
    $("#btnBell").addEventListener("click", function () {
      toast("暂无新通知");
    });

    // 主题切换
    $("#btnTheme").addEventListener("click", function () {
      prefs.theme = effectiveTheme() === "dark" ? "light" : "dark";
      applyTheme(prefs.theme, true);
      savePrefs();
      toast(prefs.theme === "dark" ? "已切换到深色主题" : "已切换到浅色主题");
    });

    // 分类筛选
    $("#filters").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cat]");
      if (!btn) return;
      prefs.category = btn.getAttribute("data-cat");
      savePrefs();
      renderAll();
      // 让选中项滚入可见区域
      btn.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    // 方向键切换分类
    $("#filters").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var tabs = Array.prototype.slice.call(
        this.querySelectorAll("[data-cat]"),
      );
      var i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      var next = e.key === "ArrowRight" ? i + 1 : i - 1;
      if (next < 0) next = tabs.length - 1;
      if (next >= tabs.length) next = 0;
      tabs[next].focus();
      tabs[next].click();
    });

    // tab 横向滚动箭头
    $("#filters").addEventListener("scroll", updateScrollArrows);
    document
      .querySelector(".scroll--back button")
      .addEventListener("click", function () {
        $("#filters").scrollBy({ left: -220, behavior: "smooth" });
      });
    document
      .querySelector(".scroll--fwd button")
      .addEventListener("click", function () {
        $("#filters").scrollBy({ left: 220, behavior: "smooth" });
      });

    // 排序下拉
    var sortLabels = { recent: "最新", title: "按标题", category: "按分类" };
    $("#btnSort").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDropdown("sortDropdown");
    });

    $("#sortMenu").addEventListener("click", function (e) {
      var opt = e.target.closest("[data-sort]");
      if (!opt) return;
      prefs.sort = opt.getAttribute("data-sort");
      $("#sortLabel").textContent = sortLabels[prefs.sort];
      this.querySelectorAll("[data-sort]").forEach(function (o) {
        o.setAttribute("aria-selected", String(o === opt));
      });
      closeDropdowns();
      savePrefs();
      renderGrid();
    });

    // 筛选面板
    $("#btnFilters").addEventListener("click", function (e) {
      e.stopPropagation();
      toggleDropdown("filtersDropdown");
    });

    $("#filtersPanel").addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // 搜索（防抖）
    var timer = null;
    $("#search").addEventListener("input", function (e) {
      var v = e.target.value;
      clearTimeout(timer);
      timer = setTimeout(function () {
        prefs.query = v;
        renderGrid();
      }, 160);
    });

    // 回车 / 点击圆形按钮：立即应用并回到结果区
    $("#navSearch").addEventListener("submit", function (e) {
      e.preventDefault();
      clearTimeout(timer);
      prefs.query = $("#search").value;
      renderGrid();
      $("#search").blur();
      $("#library").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // 只看收藏
    $("#favOnly").addEventListener("change", function () {
      prefs.favOnly = this.checked;
      savePrefs();
      renderGrid();
      updateFilterDot();
    });

    $("#btnResetFilters").addEventListener("click", function () {
      prefs.favOnly = false;
      $("#favOnly").checked = false;
      savePrefs();
      renderGrid();
      updateFilterDot();
    });

    $("#btnApplyFilters").addEventListener("click", closeDropdowns);

    // 点击空白处关闭下拉
    document.addEventListener("click", closeDropdowns);

    // 卡片区域：复制 / 收藏 / 打开详情
    $("#grid").addEventListener("click", function (e) {
      var copyBtn = e.target.closest("[data-copy]");
      if (copyBtn) {
        e.stopPropagation();
        var it = findItem(copyBtn.getAttribute("data-copy"));
        if (!it) return;
        copyText(it.body)
          .then(function () {
            copyBtn.classList.add("is-done");
            toast("已复制到剪贴板");
            setTimeout(function () {
              copyBtn.classList.remove("is-done");
            }, 1600);
          })
          .catch(function () {
            toast("复制失败，请手动选择文本");
          });
        return;
      }

      var favBtn = e.target.closest("[data-fav]");
      if (favBtn) {
        e.stopPropagation();
        var f = findItem(favBtn.getAttribute("data-fav"));
        if (!f) return;
        f.favorite = !f.favorite;
        saveData();
        if (prefs.favOnly && !f.favorite) {
          // 收藏视图中取消收藏：该条需移出列表，才整体重渲染
          renderGrid();
        } else {
          setCardFav(favBtn, f.favorite);
        }
        return;
      }

      var card = e.target.closest(".card");
      if (card) openDetail(card.getAttribute("data-id"));
    });

    // 卡片键盘打开
    $("#grid").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var card = e.target.closest(".card");
      if (!card) return;
      e.preventDefault();
      openDetail(card.getAttribute("data-id"));
    });

    // 详情操作
    var copyDetail = function () {
      var it = findItem(currentId);
      if (!it) return;
      var btn = $("#btnCopyDetail");
      copyText(it.body)
        .then(function () {
          btn.classList.add("is-done");
          btn.querySelector("span").textContent = "已复制";
          toast("已复制到剪贴板");
          setTimeout(function () {
            btn.classList.remove("is-done");
            btn.querySelector("span").textContent = "复制 Prompt";
          }, 1600);
        })
        .catch(function () {
          toast("复制失败，请手动选择文本");
        });
    };

    $("#btnCopyDetail").addEventListener("click", copyDetail);
    $("#btnUsePrompt").addEventListener("click", copyDetail);

    // 详情内收藏
    $("#btnFavDetail").addEventListener("click", function () {
      var it = findItem(currentId);
      if (!it) return;
      it.favorite = !it.favorite;
      this.classList.toggle("is-on", it.favorite);
      this.setAttribute("aria-pressed", String(it.favorite));
      this.querySelector("span").textContent = it.favorite ? "已收藏" : "收藏";
      saveData();
      if (prefs.favOnly && !it.favorite) {
        renderGrid();
      } else {
        // 同步列表中对应卡片的图标，不整列重渲染
        var cardBtn = document.querySelector('[data-fav="' + it.id + '"]');
        if (cardBtn) setCardFav(cardBtn, it.favorite);
      }
    });

    // 展开 / 收起提示词
    $("#btnExpand").addEventListener("click", function () {
      var body = $("#detailBody");
      var clamped = body.classList.toggle("is-clamped");
      this.textContent = clamped ? "展开" : "收起";
    });

    // 打开原帖
    $("#btnOpenSource").addEventListener("click", function () {
      var it = findItem(currentId);
      if (it && it.source) window.open(it.source, "_blank", "noopener");
    });

    // 下载图片（跨域时回退为新窗口打开）
    $("#btnDownload").addEventListener("click", function () {
      var it = findItem(currentId);
      if (it && it.image) window.open(it.image, "_blank", "noopener");
    });

    // 相关推荐：切换到另一条
    $("#relatedGrid").addEventListener("click", function (e) {
      var el = e.target.closest("[data-rel]");
      if (!el) return;
      openDetail(el.getAttribute("data-rel"));
    });

    $("#relatedGrid").addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var el = e.target.closest("[data-rel]");
      if (!el) return;
      e.preventDefault();
      openDetail(el.getAttribute("data-rel"));
    });

    $("#btnEdit").addEventListener("click", function () {
      closeOverlay("detailOverlay");
      openEdit(currentId);
    });

    // 删除：内嵌 WebView 不支持 window.confirm（直接返回 false 导致无法删除），
    // 改为二次点击确认——第一次点击进入待确认态，3 秒内再次点击执行删除。
    var delTimer = null;
    var disarmDelete = function () {
      var btn = $("#btnDelete");
      btn.classList.remove("is-armed");
      btn.textContent = "删除";
    };
    $("#btnDelete").addEventListener("click", function () {
      var it = findItem(currentId);
      if (!it) return;
      if (!this.classList.contains("is-armed")) {
        this.classList.add("is-armed");
        this.textContent = "再次点击确认删除";
        clearTimeout(delTimer);
        delTimer = setTimeout(disarmDelete, 3000);
        return;
      }
      clearTimeout(delTimer);
      disarmDelete();
      items = items.filter(function (x) {
        return x.id !== currentId;
      });
      saveData();
      renderAll();
      closeOverlay("detailOverlay");
      toast("已删除");
    });

    // 新建 / 保存
    $("#btnNew").addEventListener("click", function () {
      openEdit(null);
    });
    $("#btnSave").addEventListener("click", saveEdit);
    $("#editForm").addEventListener("submit", function (e) {
      e.preventDefault();
      saveEdit();
    });

    // 封面图：链接输入后测量尺寸并预览 / 本地上传 / 移除
    var urlTimer = null;
    $("#fImage").addEventListener("input", function () {
      clearTimeout(urlTimer);
      urlTimer = setTimeout(probeUrlImage, 300);
    });
    $("#fImage").addEventListener("change", probeUrlImage);
    $("#btnPickImage").addEventListener("click", function () {
      $("#fImageFile").click();
    });
    $("#fImageFile").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) readLocalImage(e.target.files[0]);
      e.target.value = "";
    });
    $("#btnClearImage").addEventListener("click", clearEditImage);

    // 导入 / 导出（入口在底部提示卡中）
    $("#btnExport2").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", function () {
      $("#fileInput").click();
    });
    $("#fileInput").addEventListener("change", function (e) {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });

    // 关闭弹层：按钮 / 点遮罩 / Esc
    document.querySelectorAll("[data-close]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        closeOverlay(btn.getAttribute("data-close"));
      });
    });

    document.querySelectorAll(".overlay").forEach(function (ov) {
      ov.addEventListener("mousedown", function (e) {
        if (e.target === ov) closeOverlay(ov.id);
      });
    });

    // 查看器：点击图片周围的空白区关闭
    document
      .querySelector(".stage")
      .addEventListener("mousedown", function (e) {
        if (e.target === this || e.target.id === "stageFigure") {
          closeOverlay("detailOverlay");
        }
      });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (document.querySelector(".dropdown.is-open")) {
          closeDropdowns();
          return;
        }
        if (!$("#editOverlay").hidden) closeOverlay("editOverlay");
        else if (!$("#detailOverlay").hidden) closeOverlay("detailOverlay");
      }
      // Cmd/Ctrl + K 聚焦导航搜索
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        $("#search").focus();
        $("#search").select();
      }
      // N 新建（无输入焦点时）
      if (
        e.key.toLowerCase() === "n" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) &&
        $("#editOverlay").hidden &&
        $("#detailOverlay").hidden
      ) {
        e.preventDefault();
        openEdit(null);
      }
    });

    // 顶部导航
    $("#navLinks").addEventListener("click", function (e) {
      var link = e.target.closest("[data-nav]");
      if (!link) return;
      e.preventDefault(); // 阻止锚点跳转，避免页面滚动
      var kind = link.getAttribute("data-nav");

      this.querySelectorAll("[data-nav]").forEach(function (a) {
        a.classList.toggle("is-active", a === link);
      });

      if (kind === "favorites") {
        prefs.favOnly = true;
        prefs.category = "All";
      } else if (kind === "library") {
        // 刷新灵感库：回到未筛选的完整列表
        prefs.favOnly = false;
        prefs.category = "All";
        prefs.query = "";
        $("#search").value = "";
      }

      $("#favOnly").checked = prefs.favOnly;
      updateFilterDot();

      savePrefs();
      renderAll();
    });

    // 点阵背景跟随光标：光斑罩住光标位置，同时整片点阵朝光标方向轻微视差位移。
    // 仅指针设备启用；离开后清空内联变量，回落到 CSS 里的居中默认值。
    var field = document.querySelector(".dotfield");
    if (field && window.matchMedia("(hover: hover)").matches) {
      var ptrX = 0;
      var ptrY = 0;
      var fieldRaf = null;
      var PARALLAX = 24; // 视差位移峰值（px），远小于 mask 边缘渐隐宽度
      var applyPointer = function () {
        fieldRaf = null;
        var r = field.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var x = ptrX - r.left;
        var y = ptrY - r.top;
        field.style.setProperty("--hero-mx", x + "px");
        field.style.setProperty("--hero-my", y + "px");
        field.style.setProperty(
          "--dot-tx",
          ((x / r.width - 0.5) * PARALLAX).toFixed(2) + "px",
        );
        field.style.setProperty(
          "--dot-ty",
          ((y / r.height - 0.5) * PARALLAX).toFixed(2) + "px",
        );
      };
      field.addEventListener("mousemove", function (e) {
        ptrX = e.clientX;
        ptrY = e.clientY;
        if (!fieldRaf) fieldRaf = requestAnimationFrame(applyPointer);
      });
      field.addEventListener("mouseleave", function () {
        if (fieldRaf) {
          cancelAnimationFrame(fieldRaf);
          fieldRaf = null;
        }
        ["--hero-mx", "--hero-my", "--dot-tx", "--dot-ty"].forEach(
          function (p) {
            field.style.removeProperty(p);
          },
        );
      });
    }

    // 筛选栏吸附：滚过筛选栏后，向下滚动吸附到顶部，向上滚动收起
    var libShell = $("#library");
    var filterbar = libShell.querySelector(".filterbar");
    var libTop = 0;
    var lastScrollY = window.scrollY;
    var scrollRaf = null;

    var measureLibTop = function () {
      libTop = libShell.getBoundingClientRect().top + window.scrollY;
    };
    measureLibTop();

    var onScroll = function () {
      scrollRaf = null;
      var y = window.scrollY;
      var delta = y - lastScrollY;
      if (y <= libTop) {
        // 回到筛选栏原始位置之上：恢复常规布局
        filterbar.classList.remove("is-pinned", "is-hidden");
        lastScrollY = y;
      } else if (delta > 4) {
        filterbar.classList.add("is-pinned");
        filterbar.classList.remove("is-hidden");
        lastScrollY = y;
      } else if (delta < -4) {
        filterbar.classList.add("is-pinned", "is-hidden");
        closeDropdowns();
        lastScrollY = y;
      }
    };

    window.addEventListener(
      "scroll",
      function () {
        if (!scrollRaf) scrollRaf = requestAnimationFrame(onScroll);
      },
      { passive: true },
    );

    // 视口变化时重排列数 + 重算滚动箭头
    var lastCols = columnCount();
    var rafId = null;
    window.addEventListener("resize", function () {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        updateScrollArrows();
        measureLibTop();
        var c = columnCount();
        if (c !== lastCols) {
          lastCols = c;
          renderGrid();
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     启动
     ------------------------------------------------------------------------ */
  function init() {
    loadPrefs();
    loadData();

    applyTheme(effectiveTheme(), false);
    watchSystemTheme();

    var sortLabels = { recent: "最新", title: "按标题", category: "按分类" };
    $("#sortLabel").textContent = sortLabels[prefs.sort] || "最新";
    $("#sortMenu")
      .querySelectorAll("[data-sort]")
      .forEach(function (o) {
        o.setAttribute(
          "aria-selected",
          String(o.getAttribute("data-sort") === prefs.sort),
        );
      });

    $("#favOnly").checked = prefs.favOnly;
    updateFilterDot();

    bind();
    renderAll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
