(function () {
	if (app.documents.length === 0) return;
	var doc = app.activeDocument;
	var artboard = doc.artboards[doc.artboards.getActiveArtboardIndex()];
	var rect = artboard.artboardRect;
	var h = rect[3] - rect[1];
	var w = rect[2] - rect[0];

	var result = {
		document: doc.name,
		width: w,
		height: h,
		layers: [],
	};

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
					layerData.objects.push({
						type: "text",
						content: tf.contents,
						x: tf.position[0] - rect[0],
						y: rect[1] - tf.position[1],
						fontSize: tf.textRange.characterAttributes.size,
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
