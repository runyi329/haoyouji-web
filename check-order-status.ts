import mysql from 'mysql2/promise';

async function checkOrderStatus() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  
  const [orders] = await connection.query(`
    SELECT order_no, amount, network, wallet_address, status, txn_hash, completed_at
    FROM recharge_orders
    WHERE order_no = 'CHG1771986246733318'
  `);
  
  console.log('========== 订单状态 ==========\n');
  console.table(orders);
  
  await connection.end();
  process.exit(0);
}

checkOrderStatus().catch((error) => {
  console.error('错误:', error);
  process.exit(1);
});
