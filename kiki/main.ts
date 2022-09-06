//
// WebSocketを使って擬似的な P2P を作成
// deno run --allow-net main.ts
//
// ws://0.0.0.0:8080/kiki?id=xx に接続
//
// メッセージを送る
//   from: xx
//   to: [yy, zz]
//   body: aa
//

const PORT = 8080;
const URL_ROOT = "/kiki";

// クライアント
type Client = {
  id: string;
  socket: WebSocket;
};

// メッセージ
type Message = {
  from: string;
  to: string[];
  body: string;
};

// 接続中の全クライアント
// TODO: - 重複排除
let clients: Client[] = [];

// クライアントを追加
function addClient(client: Client) {
  // TODO: - 重複排除
  clients.push(client);
}

// クライアントを除去
function removeClient(id: string) {
  clients = clients.filter((e) => e.id !== id);
}

// メッセージを送る
function sendMessage(message: Message) {
  const data = JSON.stringify(message);
  // 送信先のリスト
  let unsentIds = message.to;
  // 全てのクライアントに対して
  for (const client of clients) {
    // 送信先のリストに含まれていたら送信する
    if (unsentIds.includes(client.id)) {
      console.log({ data });
      client.socket.send(data);
      // 送信先リストから削除する
      unsentIds = unsentIds.filter((e) => e !== client.id);
    }
    // 全員に送信し終わったら完了
    if (unsentIds.length === 0) {
      break;
    }
  }
}

// 誰かがメッセージを送信したとき
function onClientSend(data: string) {
  const message: Message = JSON.parse(data);
  sendMessage(message);
}

// クライアント1人ずつに対する処理
function wsHandler(ws: WebSocket, id: string) {
  // 接続がオープンしたとき
  ws.onopen = () => {
    const newClient: Client = {
      id: id,
      socket: ws,
    };
    addClient(newClient);
  };
  // クライアントからメッセージを受け取ったとき
  ws.onmessage = (event) => onClientSend(event.data);
  // 接続がクローズしたとき
  ws.onclose = () => removeClient(id);
}

// Http リクエスト 1つずつに対する処理
function requestHandler(req: Deno.RequestEvent) {
  const url = new URL(req.request.url);
  const pathname = url.pathname;
  if (req.request.method === "GET" && pathname === "/") {
    // URL ルート にアクセスされたとき
    console.log("Req: OK");
    req.respondWith(
      new Response("Res: OK"),
    );
  } else if (req.request.method === "GET" && pathname === URL_ROOT) {
    // WebSocket 専用のURL にアクセスされたとき
    const room_id = url.searchParams.get("id");
    if (room_id == null) {
      req.respondWith(
        new Response("Param Not Found: id"),
      );
      return;
    } else {
      const { socket, response } = Deno.upgradeWebSocket(req.request);
      wsHandler(socket, room_id);
      req.respondWith(response);
    }
  } else {
    req.respondWith(
      new Response("Route Not Found 404"),
    );
  }
}

// 全ての Http 接続に対する処理
async function connHandler(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);
  for await (const requestEvent of httpConn) {
    requestHandler(requestEvent);
  }
}

// サーバーを起動
console.log("server starting...");
const server = Deno.listen({ port: PORT });
for await (const conn of server) {
  connHandler(conn);
}
