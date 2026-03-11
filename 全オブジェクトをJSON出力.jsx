(function () {
	if (app.documents.length === 0) return;
	var doc = app.activeDocument;
	var artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()];
	var rect = artboard.artboardRect;
	var h = rect[1] - rect[3];
	var w = rect[2] - rect[0];

	var result = {
		document: doc.name,
		width: w,
		height: h,
		layers: [],
	};

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

	// 斜体かどうかを characterAttributes から判定
	function getItalic(ca) {
		try {
			if (!ca) return false;
			if (ca.italics === true) return true;
			if (ca.textFont) {
				var name = (ca.textFont.name || "").toLowerCase();
				var psName = (ca.textFont.postscriptName || "").toLowerCase();
				if (name.indexOf("italic") >= 0 || name.indexOf("oblique") >= 0) return true;
				if (psName.indexOf("italic") >= 0 || psName.indexOf("oblique") >= 0) return true;
			}
			return false;
		} catch (e) {
			return false;
		}
	}

	// 画面更新を止めてフリーズとエラーを防止
	app.screenUpdating = false;

	try {
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
					var isItalic = getItalic(ca);
					layerData.objects.push({
						type: "text",
						content: tf.contents,
						x: tf.position[0] - rect[0],
						y: rect[1] - tf.position[1],
						fontSize: ca.size,
						fillColor: fillHex,
						italic: isItalic,
					});
				} catch (e) {}
			}

			// 2. 画像（PSDリンク）
			for (var p = 0; p < layer.placedItems.length; p++) {
				var pi = layer.placedItems[p];
				try {
					layerData.objects.push({
						type: "image",
						file: pi.file ? pi.file.name : "embedded_or_missing",
						x: pi.position[0],
						y: h - pi.position[1],
					});
				} catch (e) {}
			}

			// 3. パス（※エラーが出やすいのでtry-catchで保護）
			// for (var s = 0; s < layer.pathItems.length; s++) {
			//     var path = layer.pathItems[s];
			//     try {
			//         layerData.objects.push({
			//             type: "path",
			//             x: path.position[0],
			//             y: h - path.position[1]
			//         });
			//     } catch(e) {}
			// }

			result.layers.push(layerData);
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
