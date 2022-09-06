//
// --- --- --- --- --- --- --- ---
// ルームを作成するサンプル サーバー側
// --- --- --- --- --- --- --- ---
//
// 1. 移動
//   このファイルがある階層まで移動
//   $ cd xxx
//
// 2. 実行
//   $ deno run --allow-net server.ts
//

// メッセージ
type Message = {
  action: string;
  client_id: string;
  body: string;
};

// クライアント
type Client = {
  id: string;
  socket: WebSocket;
};

// ルーム
type Room = {
  id: string;
  clients: Client[];
};

// ルーム一覧
const rooms: Map<string, Room> = new Map();

// 新しいルームを作成
function createRoom(room_id: string, client: Client): boolean {
  const room: Room = {
    id: room_id,
    clients: [client],
  };
  if (rooms.get(room_id)) {
    console.log("すでに同じIDのルームが存在します");
    return true;
  }
  rooms.set(room_id, room);
  return true;
}

// ルームに参加
function joinRoom(room_id: string, client: Client): boolean {
  // 対象のルームを見つける
  const room = rooms.get(room_id);
  if (!room) {
    console.log("ルームが見つかりませんでした");
    return false;
  }
  const oldClient = room.clients.findIndex((e) => e.id === client.id);
  if (oldClient >= 0) {
    console.log("すでに参加中のクライアントです");
    return true;
  }
  room.clients.push(client);
  return true;
}

// ルームから退出
function exitRoom(room_id: string, client_id: string): boolean {
  // 対象のルームを見つける
  const room = rooms.get(room_id);
  if (!room) {
    console.log("ルームが見つかりませんでした");
    return false;
  }
  // クライアントを削除
  room.clients = room.clients.filter((e) => e.id !== client_id);
  // クライアントが0人になったらルームを削除
  if (room.clients.length === 0) {
    rooms.delete(room_id);
  }
  return true;
}

// メッセージを送る
function sendMessage(
  message: Message,
  room_id: string,
) {
  // 対象のルームを見つける
  const room = rooms.get(room_id);
  if (!room) {
    console.log("ルームが見つかりませんでした");
    return;
  }
  // 全員に送信
  for (const client of room.clients) {
    const json = JSON.stringify(message);
    client.socket.send(json);
  }
}

// クライアント1人ずつに対する処理
function clientHandler(room_id: string, client: Client) {
  // クライアントが接続したとき
  client.socket.onopen = () => {
    // 送信するメッセージ
    const message: Message = {
      action: "join",
      client_id: client.id,
      body: "参加しました",
    };
    sendMessage(message, room_id);
  };
  // クライアントからメッセージを受け取ったとき
  client.socket.onmessage = (event) => {
    // 送信するメッセージ
    const message: Message = {
      action: "event",
      client_id: client.id,
      body: event.data,
    };
    sendMessage(message, room_id);
  };
  // クライアントが切断したとき
  client.socket.onclose = () => {
    // 自動的に退出
    exitRoom(room_id, client.id);
    // 送信するメッセージ
    const message: Message = {
      action: "exit",
      client_id: client.id,
      body: "退出しました",
    };
    sendMessage(message, room_id);
  };
}

//
// ルーム作成
// ws://0.0.0.0:3000/rooms?command=create&room_id=x&client_id=x
// ルーム参加
// ws://0.0.0.0:3000/rooms?command=join&room_id=x&client_id=x
//

// Http リクエスト 1つずつに対する処理
function requestHandler(req: Deno.RequestEvent) {
  const url = new URL(req.request.url);
  const pathname = url.pathname;
  // URLチェック
  if (req.request.method === "GET" && pathname === "/rooms") {
    // パラメータチェック
    const command = url.searchParams.get("command");
    const room_id = url.searchParams.get("room_id");
    const client_id = url.searchParams.get("client_id");
    if (!command || !room_id || !client_id) {
      console.log("必要なパラメータが見つかりません");
      return;
    }
    // WebSocket で接続
    const { socket, response } = Deno.upgradeWebSocket(req.request);
    const client: Client = {
      id: client_id,
      socket: socket,
    };
    // ルーム作成または参加
    let result = false;
    if (command === "create") {
      result = createRoom(room_id, client);
    } else if (command === "join") {
      result = joinRoom(room_id, client);
    }
    if (!result) {
      // 失敗
      req.respondWith(new Response("ルーム作成または参加に失敗しました"));
      return;
    }
    clientHandler(room_id, client);
    req.respondWith(response);
  } else {
    req.respondWith(new Response("不正なURLです"));
    return;
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
console.log("Online-Room-Server starting");
const server = Deno.listen({ port: 3000 });
for await (const conn of server) {
  connHandler(conn);
}
