//
// --- --- --- --- --- --- --- --- ---
// ルームを作成するサンプル クライアント側
// --- --- --- --- --- --- --- --- ---
//
// 1. flutterプロジェクト作成
//   $ flutter create client
//   $ cd client
//
// 2. パッケージのインストール
//   pubspec.yaml ファイルに以下を追加
//   dependencies:
//     flutter_riverpod: # これを追加
//     web_socket_channel: # これを追加
//
// 3. コードを編集
//   main.dart ファイルの中身を、このファイルで上書き
//
// 4. 実行
//   $ flutter pub get
//   $ flutter run
//

import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

main() {
  const app = MaterialApp(home: ChooseClientPage());
  const scope = ProviderScope(child: app);
  runApp(scope);
}

// --- --- --- [ WebSocket ここから ] --- --- ---

// メッセージ
class Message {
  // join | event | exit
  final String action;
  // クライアントID
  final String client_id;
  // メッセージ本文
  final String body;
  Message({
    required this.action,
    required this.client_id,
    required this.body,
  });
  // JSON 変換
  Message.fromJson(Map<String, dynamic> json)
      : action = json['action'],
        client_id = json['client_id'],
        body = json['body'];
  Map<String, dynamic> toJson() => {
        'action': action,
        'client_id': client_id,
        'body': body,
      };
}

// オンラインのルーム
class OnlineRoom {
  // WebSocket
  WebSocketChannel? _channel;

  // 接続先URL
  Uri endpoint(
    String command,
    String room_id,
    String client_id,
  ) {
    return Uri(
      scheme: 'ws',
      host: '0.0.0.0',
      path: 'rooms',
      port: 3000,
      queryParameters: {
        'command': command,
        'room_id': room_id,
        'client_id': client_id,
      },
    );
  }

  // ルームを作成
  void create(
    String room_id,
    String client_id,
    void Function(Message message) onReceive,
  ) {
    // WebSocket接続
    final url = endpoint('create', room_id, client_id);
    _channel = WebSocketChannel.connect(url);
    // WebSocketメッセージ受信
    _channel?.stream.listen((event) {
      final json = jsonDecode(event);
      final message = Message.fromJson(json);
      /* ここでメッセージを受け取った時の処理 */
      onReceive.call(message);
    });
  }

  // ルームに参加
  void join(
    String room_id,
    String client_id,
    void Function(Message message) onReceive,
    void Function() onFailed,
  ) {
    // WebSocket接続
    final url = endpoint('join', room_id, client_id);
    _channel = WebSocketChannel.connect(url);
    // WebSocketメッセージ受信
    _channel?.stream.listen((event) {
      final json = jsonDecode(event);
      final message = Message.fromJson(json);
      /* ここでメッセージを受け取った時の処理 */
      onReceive.call(message);
    }, onError: (err) {
      // 存在しないルーム等で参加に失敗したとき
      onFailed();
    });
  }

  // ルームを退出
  Future<void> exit() async {
    await _channel?.sink.close();
    _channel = null;
  }

  // メッセージを送信
  sendMessage(String body) {
    _channel?.sink.add(body);
  }
}

// --- --- --- [ WebSocket ここまで ] --- --- ---

// クライアント
class Client {
  final String id;
  final List<String> cards;
  final Color color;
  const Client({
    required this.id,
    required this.cards,
    required this.color,
  });
}

// クライアント一覧
const clients = [
  Client(
    id: 'Aさん',
    cards: ['ハート1', 'ハート2', 'ハート3'],
    color: Colors.red,
  ),
  Client(
    id: 'Bさん',
    cards: ['スペード4', 'スペード5', 'スペード6'],
    color: Colors.green,
  ),
  Client(
    id: 'Cさん',
    cards: ['ダイヤ7', 'ダイヤ8', 'ダイヤ9'],
    color: Colors.blue,
  ),
];

// クライアント選択画面
class ChooseClientPage extends StatelessWidget {
  const ChooseClientPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // クライアントの数だけボタンを並べる
            for (final client in clients)
              ElevatedButton(
                onPressed: () {
                  // ルーム画面へ進む
                  final route = MaterialPageRoute(
                    builder: (context) => RoomPage(client),
                  );
                  Navigator.of(context).push(route);
                },
                child: Text(client.id),
              ),
          ],
        ),
      ),
    );
  }
}

// ルームに接続するオブジェクト
final room = OnlineRoom();

// 受信したメッセージ
final messageProvider = StateProvider<String>((ref) {
  return "まだメッセージはありません";
});

// テキストフィールド の コントローラー
final controller = TextEditingController();

// ルーム画面
class RoomPage extends ConsumerWidget {
  final Client client;

  const RoomPage(this.client, {Key? key}) : super(key: key);
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 受信したメッセージ
    final message = ref.watch(messageProvider);
    return Scaffold(
      // 自分の名前と色
      appBar: AppBar(
        title: Text(client.id),
        backgroundColor: client.color,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // ルームに関する情報を表示
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // ルームID入力フォーム
                SizedBox(
                  width: 100,
                  height: 50,
                  child: TextField(
                    controller: controller,
                    decoration: const InputDecoration(
                      border: OutlineInputBorder(),
                      labelText: "ルームID",
                      hintText: "ルームID",
                    ),
                  ),
                ),
                // ルーム作成ボタン
                ElevatedButton(
                  onPressed: () => createRoom(ref, controller.text),
                  child: const Text('ルーム作成'),
                ),
                // ルーム参加ボタン
                ElevatedButton(
                  onPressed: () => joinRoom(ref, controller.text),
                  child: const Text('ルーム参加'),
                ),
              ],
            ),
            // 受信したメッセージを表示
            Container(
              width: double.infinity,
              height: 120,
              color: Colors.black,
              child: Text(
                message,
                maxLines: 5,
                style: const TextStyle(color: Colors.lightGreen, fontSize: 16),
              ),
            ),
            // カードを並べる
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final card in client.cards)
                  ElevatedButton(
                    onPressed: () => chooseCard(card),
                    child: Text(card),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  // ルームを作成
  void createRoom(WidgetRef ref, String room_id) {
    // ルームIDチェック
    if (room_id == '') {
      ref.read(messageProvider.notifier).state = 'ルームIDを入力してください';
      return;
    }
    room.create(room_id, client.id, (message) {
      // 受信したメッセージは画面に表示
      final text = '${message.client_id}: ${message.body}';
      ref.read(messageProvider.notifier).state = text;
    });
  }

  // ルームに参加
  void joinRoom(WidgetRef ref, String room_id) {
    // ルームIDチェック
    if (room_id == '') {
      ref.read(messageProvider.notifier).state = 'ルームIDを入力してください';
      return;
    }
    room.join(room_id, client.id, (message) {
      // 受信したメッセージは画面に表示
      final text = '${message.client_id}: ${message.body}';
      ref.read(messageProvider.notifier).state = text;
    }, () {
      // 失敗メッセージを画面に表示
      ref.read(messageProvider.notifier).state = '参加に失敗しました';
    });
  }

  // カードを選択
  void chooseCard(String card) {
    room.sendMessage('$cardを選択しました');
  }
}
