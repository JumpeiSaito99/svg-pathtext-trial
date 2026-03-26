(function () {
	if (app.documents.length === 0) return;
	var doc = app.activeDocument;
  var targetLayer = "製図線断ち線文字危険線";
  var targetName = "Medi座標抽出用";
  var bgTargetLayer = "7101.レリーフ";
  var bgTargetName = "レリーフ4c九州地方.psd";

	// 文字色（Color）を #RRGGBB 形式に変換
	function getFillColorHex(color) {
		try {
			if (!color) return "";
			if (color.typename === "RGBColor") {
				var r = Math.round(color.red);
				var g = Math.round(color.green);
				var b = Math.round(color.blue);
				var pad = function (n) {
					var s = n.toString(16);
					return s.length === 1 ? "0" + s : s;
				};
				return "#" + pad(r) + pad(g) + pad(b);
			}
			if (color.typename === "CMYKColor") {
				var c = color.cyan / 100;
				var m = color.magenta / 100;
				var y = color.yellow / 100;
				var k = color.black / 100;
				var r = 255 * (1 - c) * (1 - k);
				var g = 255 * (1 - m) * (1 - k);
				var b = 255 * (1 - y) * (1 - k);
				r = Math.min(255, Math.max(0, Math.round(r)));
				g = Math.min(255, Math.max(0, Math.round(g)));
				b = Math.min(255, Math.max(0, Math.round(b)));
				var p = function (n) {
					var s = n.toString(16);
					return s.length === 1 ? "0" + s : s;
				};
				return "#" + p(r) + p(g) + p(b);
			}
			return "";
		} catch (e) {
			return "";
		}
	}

	// 画面更新を止めてフリーズとエラーを防止
	app.screenUpdating = false;

	try {
    var target = doc.layers[targetLayer];
    var origin = target.pageItems.getByName(targetName);
    var bounds = origin.visibleBounds;
    var originx = bounds[0];
    var originy = bounds[1];

    var bgTarget = doc.layers[bgTargetLayer].pageItems.getByName(bgTargetName);
    var bgBounds = bgTarget.visibleBounds;
    var bgOriginx = bgBounds[0];
    var bgOriginy = bgBounds[1];
  
    var result = {
      document: doc.name,
      width: bounds[2] - originx,
      height: originy - bounds[3],
      bgoffsetx: bgOriginx - originx,
      bgoffsety: originy - bgOriginy,
      layers: [],
    };

		for (var i = 0; i < doc.layers.length; i++) {
			var layer = doc.layers[i];
			// ロックされていたり非表示のレイヤーも、データ抽出だけなら読み取れますが
			// 編集不可エラーを避けるため、安全策として書き出さない設定にします
			if (!layer.visible || layer.locked) continue;

			var layerData = { name: layer.name, objects: [] };

			// 1. テキスト
			for (var t = 0; t < layer.textFrames.length; t++) {
				var tf = layer.textFrames[t];
				try {
					var ca = tf.textRange.characterAttributes;
					var fillHex = getFillColorHex(ca.fillColor);
					layerData.objects.push({
						type: "text",
						content: tf.contents,
						x: tf.position[0] - originx,
						y: originy - tf.position[1],
						fontSize: ca.size,
						fillColor: fillHex,
					});
				} catch (e) {}
			}

      if (layerData.objects.length > 0) {
        result.layers.push(layerData);
      }
		}

		// JSON書き出し実行
		var jsonString = JSON_stringify(result);
		var saveFile = new File(
			Folder.desktop + "/" + doc.name.split(".")[0] + ".json",
		);
		saveFile.encoding = "UTF8";
		saveFile.open("w");
		saveFile.write(jsonString);
		saveFile.close();
		alert("成功！デスクトップを確認してください。");
	} catch (mainError) {
		alert(
			"実行エラー: " + mainError.message + " (Line: " + mainError.line + ")",
		);
	} finally {
		app.screenUpdating = true;
	}

	// 文字列をJSONセーフな形式に変換する関数
	function escapeString(str) {
		if (!str) return "";
		return str
			.toString()
			.replace(/\\/g, "") // バックスラッシュをエスケープ
			.replace(/"/g, '"') // ダブルクォーテーションをエスケープ
			.replace(/\n/g, "") // 改行を \n という文字列に変換
			.replace(/\r/g, "") // キャリッジリターンを \r に変換
			.replace(/\t/g, ""); // タブを \t に変換
	}

	// --- スクリプト内の適用箇所イメージ ---
	layerData.objects.push({
		type: "text",
		content: escapeString(tf.contents), // ここで適用！
		// ... 他の属性
	});

	// 補助関数：JSON変換（再掲）
	function JSON_stringify(obj) {
		var t = typeof obj;
		if (t != "object" || obj === null) {
			if (t == "string") return '"' + obj.replace(/"/g, '\\"') + '"';
			return String(obj);
		} else {
			var n,
				v,
				json = [],
				arr = obj && obj.constructor == Array;
			for (n in obj) {
				v = obj[n];
				t = typeof v;
				if (t == "function") continue;
				if (t == "string") v = '"' + v.replace(/"/g, '\\"') + '"';
				else if (t == "object" && v !== null) v = JSON_stringify(v);
				json.push((arr ? "" : '"' + n + '":') + String(v));
			}
			return (arr ? "[" : "{") + String(json) + (arr ? "]" : "}");
		}
	}
})();
