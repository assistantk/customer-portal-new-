import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;

public class TestDB {
    public static void main(String[] args) {
        String url = "jdbc:oracle:thin:@//tndexaccvm-scan.crisexacc.org:1521/test.crisexacc.org";
        String user = "tms3t";
        String pass = "tms3t";
        
        try {
            Class.forName("oracle.jdbc.OracleDriver");
            try (Connection conn = DriverManager.getConnection(url, user, pass)) {
                System.out.println("Connected to Database!");
                String sql = "SELECT MAVGLBLCUSTCODE as customer_code, MAVGLBLCUSTNAME as company_name, MAVGLBLCUSTADDRTEXT as address, MAVCUSTPANNUMB as pan_number, MAVCUSTGSTNUMB as gstin_numbers, MAVGNBLCUSTCITYNAME as city, MAVPCOCODE as pincode, MADIMPLDATE as creation_date FROM MEMGLBLCUST WHERE MAVGLBLCUSTCODE = ?";
                try (PreparedStatement ps = conn.prepareStatement(sql)) {
                    ps.setString(1, "ABME");
                    try (ResultSet rs = ps.executeQuery()) {
                        if (rs.next()) {
                            System.out.println("Found: " + rs.getString("company_name"));
                        } else {
                            System.out.println("Not found");
                        }
                    }
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
