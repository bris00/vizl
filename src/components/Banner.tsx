import Navbar from "react-bootstrap/Navbar";
import Container from "react-bootstrap/Container";

import { useUser } from '@/composable/user';

export default function Banner() {
    const user = useUser();

    const logout = () => {
      user.setAccessToken(null);
      user.setIdToken(null);
      user.setRefreshToken(null);
    };

    return (
      <Navbar collapseOnSelect expand={false} bg="dark" variant='dark'>
        <Container>
          <Navbar.Toggle aria-controls="responsive-navbar-nav" />
          <Navbar.Brand href="#">
            VIZL
          </Navbar.Brand>
          {user.id ? <Navbar.Text>{user.id.preferred_username}</Navbar.Text> : <Navbar.Text></Navbar.Text>} 
        </Container>
        <Navbar.Collapse id="responsive-navbar-nav">
        </Navbar.Collapse>
      </Navbar>
    );
}