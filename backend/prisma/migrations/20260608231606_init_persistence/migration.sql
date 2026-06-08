-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('OFFLINE', 'ONLINE', 'ON_TRIP');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('PARTICULAR', 'TAXI', 'MOTO');

-- CreateEnum
CREATE TYPE "BusinessCategory" AS ENUM ('RESTAURANT', 'SUPERMARKET', 'PHARMACY', 'OTHER');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'DRIVER_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransportType" AS ENUM ('TAXI', 'MOTO', 'PARTICULAR', 'ENVIOS', 'MANDADO');

-- CreateEnum
CREATE TYPE "WorkMode" AS ENUM ('PASAJERO', 'PEDIDO', 'PAQUETE', 'MANDADO');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('SEARCHING', 'ACCEPTED', 'ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ErrandCategory" AS ENUM ('PHARMACY', 'GROCERIES', 'DOCUMENTS', 'PAYMENTS', 'FOOD', 'SHOPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "ErrandStatus" AS ENUM ('SEARCHING', 'ACCEPTED', 'SHOPPING', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IntercityCity" AS ENUM ('PAMPLONA', 'CUCUTA', 'BUCARAMANGA', 'CHITAGA', 'MALAGA', 'OCANA', 'BOGOTA');

-- CreateEnum
CREATE TYPE "IntercitySeats" AS ENUM ('ONE', 'TWO', 'THREE', 'FLEET');

-- CreateEnum
CREATE TYPE "IntercityStatus" AS ENUM ('SEARCHING', 'DRIVER_FOUND', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PooledTripStatus" AS ENUM ('OPEN', 'FULL', 'DEPARTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatBookingStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_sessions" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "driverId" TEXT,

    CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "avatarUrl" TEXT,
    "documentType" TEXT,
    "documentNumber" TEXT,
    "licenseNumber" TEXT,
    "status" "DriverStatus" NOT NULL DEFAULT 'OFFLINE',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "bio" TEXT,
    "bankName" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_documents" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TEXT,
    "rejectionReason" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "driver_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "plate" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerName" TEXT,
    "category" "BusinessCategory" NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "phone" TEXT,
    "whatsapp" TEXT,
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
    "etaMinutes" INTEGER NOT NULL DEFAULT 30,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 2500,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "imageUrl" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderRef" TEXT NOT NULL,
    "userId" TEXT,
    "businessId" TEXT NOT NULL,
    "driverId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "deliveryAddress" TEXT NOT NULL,
    "deliveryLat" DOUBLE PRECISION,
    "deliveryLng" DOUBLE PRECISION,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "etaMinutes" INTEGER,
    "pickupPhotoUrl" TEXT,
    "deliveryPhotoUrl" TEXT,
    "hasSignature" BOOLEAN NOT NULL DEFAULT false,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "pickedUpAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" TEXT NOT NULL,
    "requestRef" TEXT NOT NULL,
    "passengerId" TEXT,
    "driverId" TEXT,
    "vehicleId" TEXT,
    "serviceType" "TransportType" NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'SEARCHING',
    "originAddress" TEXT NOT NULL,
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "destAddress" TEXT NOT NULL,
    "destLat" DOUBLE PRECISION NOT NULL,
    "destLng" DOUBLE PRECISION NOT NULL,
    "estimatedFare" DOUBLE PRECISION NOT NULL,
    "finalFare" DOUBLE PRECISION,
    "distanceKm" DOUBLE PRECISION,
    "etaMinutes" INTEGER,
    "cancelReason" TEXT,
    "pickupPhotoUrl" TEXT,
    "deliveryPhotoUrl" TEXT,
    "recipientName" TEXT,
    "recipientPhone" TEXT,
    "packageDescription" TEXT,
    "rating" INTEGER,
    "ratingComment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_earnings" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "grossFare" DOUBLE PRECISION NOT NULL,
    "commission" DOUBLE PRECISION NOT NULL,
    "netEarning" DOUBLE PRECISION NOT NULL,
    "tripCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "driver_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "errands" (
    "id" TEXT NOT NULL,
    "requestRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driverId" TEXT,
    "category" "ErrandCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "pickupAddress" TEXT NOT NULL,
    "dropoffAddress" TEXT NOT NULL,
    "serviceFee" DOUBLE PRECISION NOT NULL DEFAULT 6000,
    "purchaseBudget" DOUBLE PRECISION,
    "actualCost" DOUBLE PRECISION,
    "notes" TEXT,
    "status" "ErrandStatus" NOT NULL DEFAULT 'SEARCHING',
    "proofPhotoUrl" TEXT,
    "deliveryPhotoUrl" TEXT,
    "hasSignature" BOOLEAN NOT NULL DEFAULT false,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "errands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intercity_bookings" (
    "id" TEXT NOT NULL,
    "requestRef" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driverId" TEXT,
    "origin" "IntercityCity" NOT NULL,
    "destination" "IntercityCity" NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "seats" "IntercitySeats" NOT NULL,
    "offeredFare" DOUBLE PRECISION NOT NULL,
    "counterFare" DOUBLE PRECISION,
    "finalFare" DOUBLE PRECISION,
    "status" "IntercityStatus" NOT NULL DEFAULT 'SEARCHING',
    "pickupAddress" TEXT,
    "dropoffAddress" TEXT,
    "notes" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "driverVehicle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "intercity_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pooled_trips" (
    "id" TEXT NOT NULL,
    "tripRef" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "driverPhone" TEXT NOT NULL,
    "vehicleDescription" TEXT NOT NULL,
    "origin" "IntercityCity" NOT NULL,
    "destination" "IntercityCity" NOT NULL,
    "departureTime" TIMESTAMP(3) NOT NULL,
    "totalSeats" INTEGER NOT NULL,
    "farePerSeat" DOUBLE PRECISION NOT NULL,
    "maxFarePerSeat" DOUBLE PRECISION NOT NULL,
    "allowFleet" BOOLEAN NOT NULL DEFAULT false,
    "status" "PooledTripStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pooled_trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_bookings" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "passengerPhone" TEXT NOT NULL,
    "seatsBooked" INTEGER NOT NULL,
    "pickupAddress" TEXT,
    "notes" TEXT,
    "status" "SeatBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "tripId" TEXT,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "description" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "orderId" TEXT,
    "tripId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "otp_sessions_phone_idx" ON "otp_sessions"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_phone_key" ON "drivers"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_email_key" ON "drivers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_documentNumber_key" ON "drivers"("documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE INDEX "drivers_status_idx" ON "drivers"("status");

-- CreateIndex
CREATE INDEX "driver_documents_driverId_idx" ON "driver_documents"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_documents_driverId_type_key" ON "driver_documents"("driverId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "vehicles_plate_key" ON "vehicles"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_token_key" ON "businesses"("token");

-- CreateIndex
CREATE INDEX "businesses_category_idx" ON "businesses"("category");

-- CreateIndex
CREATE INDEX "products_businessId_idx" ON "products"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderRef_key" ON "orders"("orderRef");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_driverId_idx" ON "orders"("driverId");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "trips_requestRef_key" ON "trips"("requestRef");

-- CreateIndex
CREATE INDEX "trips_passengerId_idx" ON "trips"("passengerId");

-- CreateIndex
CREATE INDEX "trips_driverId_idx" ON "trips"("driverId");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE INDEX "driver_earnings_driverId_idx" ON "driver_earnings"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "driver_earnings_driverId_date_key" ON "driver_earnings"("driverId", "date");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "errands_requestRef_key" ON "errands"("requestRef");

-- CreateIndex
CREATE INDEX "errands_userId_idx" ON "errands"("userId");

-- CreateIndex
CREATE INDEX "errands_driverId_idx" ON "errands"("driverId");

-- CreateIndex
CREATE INDEX "errands_status_idx" ON "errands"("status");

-- CreateIndex
CREATE UNIQUE INDEX "intercity_bookings_requestRef_key" ON "intercity_bookings"("requestRef");

-- CreateIndex
CREATE INDEX "intercity_bookings_userId_idx" ON "intercity_bookings"("userId");

-- CreateIndex
CREATE INDEX "intercity_bookings_status_idx" ON "intercity_bookings"("status");

-- CreateIndex
CREATE UNIQUE INDEX "pooled_trips_tripRef_key" ON "pooled_trips"("tripRef");

-- CreateIndex
CREATE INDEX "pooled_trips_driverId_idx" ON "pooled_trips"("driverId");

-- CreateIndex
CREATE INDEX "pooled_trips_status_idx" ON "pooled_trips"("status");

-- CreateIndex
CREATE INDEX "pooled_trips_origin_destination_idx" ON "pooled_trips"("origin", "destination");

-- CreateIndex
CREATE INDEX "seat_bookings_tripId_idx" ON "seat_bookings"("tripId");

-- CreateIndex
CREATE INDEX "seat_bookings_userId_idx" ON "seat_bookings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_referenceCode_key" ON "payments"("referenceCode");

-- CreateIndex
CREATE INDEX "payments_clientId_idx" ON "payments"("clientId");

-- AddForeignKey
ALTER TABLE "otp_sessions" ADD CONSTRAINT "otp_sessions_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_sessions" ADD CONSTRAINT "otp_sessions_phone_fkey" FOREIGN KEY ("phone") REFERENCES "users"("phone") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_documents" ADD CONSTRAINT "driver_documents_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_earnings" ADD CONSTRAINT "driver_earnings_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "errands" ADD CONSTRAINT "errands_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intercity_bookings" ADD CONSTRAINT "intercity_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_bookings" ADD CONSTRAINT "seat_bookings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "pooled_trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seat_bookings" ADD CONSTRAINT "seat_bookings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
