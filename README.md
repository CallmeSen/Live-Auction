# Live-Auction
===== HƯỚNG DẪN CLONE & CHẠY BACKEND (SPRING BOOT + DOCKER MYSQL) =====
**1. Clone project**
Bằng lệnh: git clone -b develop https://github.com/CallmeSen/Live-Auction.git
(vì souce code đồ án nằm ở nhanh develop chứ k ở nhanh main)
sau đó trên terminal, cd backend/backend để tiến hành thao tác kết nối databse và chạy backend

**2. Chạy MySQL bằng Docker**
👉 Nếu chưa có container, trên terminal, chạy:
  docker run -d `
--name auction-mysql `
-e MYSQL_ROOT_PASSWORD=Asdf1234! `
-e MYSQL_DATABASE=auction_dbb `
-e MYSQL_USER=username ` (đặt tên tuy ý nhưng xuống dưới phải ghi đúng tên)
-e MYSQL_PASSWORD=123456 ` (tương tự)
-p 3306:3306 `
mysql:8.0

- Kiểm tra container bằng lệnh: docker ps
- -Phải thấy: auction-mysql
              0.0.0.0:3306->3306

**3. Tạo file .env**
- Trong thư mục backend\backend. tạo file .env
  trong file .env cấu hình như sau:

  =============
MYSQL_CONTAINER_NAME=auction-mysql
MYSQL_ROOT_PASSWORD=Asdf1234!
MYSQL_DATABASE=auction_dbb
MYSQL_USER=user_ name đặt ở trên
MYSQL_PASSWORD=pass đặt ở trên
MYSQL_PORT=3306

DB_URL=jdbc:mysql://localhost:3306/auction_dbb
DB_USERNAME=user_ name đặt ở trên
DB_PASSWORD=pass đặt ở trên
JWT_SECRET=1234567890123456789012345678901234567890123456789012345678901234
JWT_EXPIRATION=86400000
    ==============

**4. Cấu hình Spring Boot**
- Check xem file application.properties
nằm ở (Live-Auction\backend\src\main\resources\application.properties)
nếu đã có thì thôi, chưa có thì thêm vào file đó
 =============
spring.datasource.url=${DB_URL}
spring.datasource.username=${DB_USERNAME}
spring.datasource.password=${DB_PASSWORD}

spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true
spring.jpa.database-platform=org.hibernate.dialect.MySQL8Dialect
  ============

**5. Install dependencies (lần đầu nếu cần)**
chạy lệnh: mvn clean install

**6. Chạy backend**
chạy lệnh trên terminal: mvn spring-boot:run

**7. Kiểm tra backend**
Mở: http://localhost:8080

hoặc Swagger: http://localhost:8080/swagger-ui/index.html

 - thoát thì ấn ctrl + C rồi chọn Y để xác nhận 