FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q dependency:go-offline
COPY src ./src
RUN mvn -q clean package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/*.jar app.jar
# Listen host/port come from SERVER_HOST / SERVER_PORT env (application.yml). No port literal here.
ENTRYPOINT ["java", "-jar", "app.jar"]
