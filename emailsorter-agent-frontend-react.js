// EmailSorter Agent - Frontend (React)
// ===================================
// Interface utilisateur pour configurer et lancer le tri des emails.

// Pour utiliser ce code, installe d'abord les dépendances :
// npm install react axios @mui/material @mui/icons-material @emotion/react @emotion/styled

import React, { useState, useEffect } from "react";
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Snackbar,
  Alert,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  CheckCircle,
  Error,
  Info,
  Refresh,
  Settings,
  Star,
  Label,
  Archive,
  Work,
  Home,
  LocalOffer,
  Mail,
  Spam
} from "@mui/icons-material";
import axios from "axios";

// URL du backend (à adapter selon ton hébergement)
const BACKEND_URL = "http://localhost:5000";

// Composant principal
function App() {
  const [emails, setEmails] = useState([]);
  const [rules, setRules] = useState({});
  const [customRules, setCustomRules] = useState({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentCategory, setCurrentCategory] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [newSender, setNewSender] = useState("");
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });
  const [tabValue, setTabValue] = useState(0);

  // Charger les règles par défaut
  useEffect(() => {
    axios.get(`${BACKEND_URL}/rules`)
      .then((response) => {
        setRules(response.data);
        setCustomRules(response.data);
      })
      .catch((error) => {
        console.error("Erreur lors du chargement des règles :", error);
        setSnackbar({ open: true, message: "Erreur lors du chargement des règles.", severity: "error" });
      });
  }, []);

  // Démarrer l'authentification OAuth
  const handleAuth = () => {
    axios.get(`${BACKEND_URL}/auth/start`)
      .then((response) => {
        window.location.href = response.data.auth_url;
      })
      .catch((error) => {
        console.error("Erreur lors de l'authentification :", error);
        setSnackbar({ open: true, message: "Erreur lors de l'authentification.", severity: "error" });
      });
  };

  // Traiter les emails
  const handleProcessEmails = (dryRun = false) => {
    setLoading(true);
    axios.post(`${BACKEND_URL}/process`, { dry_run: dryRun, custom_rules: customRules })
      .then((response) => {
        setEmails(response.data.processed_emails);
        setIsAuthenticated(true);
        setSnackbar({
          open: true,
          message: `Traitement terminé ! ${response.data.count} emails ${dryRun ? "simulés" : "traités"}.`,
          severity: "success"
        });
      })
      .catch((error) => {
        console.error("Erreur lors du traitement :", error);
        setSnackbar({ open: true, message: "Erreur lors du traitement des emails.", severity: "error" });
      })
      .finally(() => {
        setLoading(false);
      });
  };

  // Ajouter une règle personnalisée
  const handleAddRule = () => {
    if (!currentCategory || (!newKeyword && !newSender)) {
      setSnackbar({ open: true, message: "Veuillez remplir tous les champs.", severity: "error" });
      return;
    }

    const updatedRules = { ...customRules };
    if (!updatedRules[currentCategory]) {
      updatedRules[currentCategory] = { keywords: [], senders: [], action: {} };
    }

    if (newKeyword) {
      updatedRules[currentCategory].keywords.push(newKeyword);
    }
    if (newSender) {
      updatedRules[currentCategory].senders.push(newSender);
    }

    setCustomRules(updatedRules);
    setNewKeyword("");
    setNewSender("");
    setOpenDialog(false);

    // Met à jour les règles sur le backend
    axios.post(`${BACKEND_URL}/rules`, updatedRules)
      .then(() => {
        setSnackbar({ open: true, message: "Règle ajoutée avec succès !", severity: "success" });
      })
      .catch((error) => {
        console.error("Erreur lors de la mise à jour des règles :", error);
        setSnackbar({ open: true, message: "Erreur lors de la mise à jour des règles.", severity: "error" });
      });
  };

  // Supprimer une règle
  const handleDeleteRule = (category, type, index) => {
    const updatedRules = { ...customRules };
    if (type === "keyword") {
      updatedRules[category].keywords.splice(index, 1);
    } else if (type === "sender") {
      updatedRules[category].senders.splice(index, 1);
    }
    setCustomRules(updatedRules);

    // Met à jour les règles sur le backend
    axios.post(`${BACKEND_URL}/rules`, updatedRules)
      .then(() => {
        setSnackbar({ open: true, message: "Règle supprimée avec succès !", severity: "success" });
      })
      .catch((error) => {
        console.error("Erreur lors de la suppression de la règle :", error);
        setSnackbar({ open: true, message: "Erreur lors de la suppression de la règle.", severity: "error" });
      });
  };

  // Réinitialiser les règles
  const handleResetRules = () => {
    setCustomRules({ ...rules });
    axios.post(`${BACKEND_URL}/rules`, { ...rules })
      .then(() => {
        setSnackbar({ open: true, message: "Règles réinitialisées avec succès !", severity: "success" });
      })
      .catch((error) => {
        console.error("Erreur lors de la réinitialisation des règles :", error);
        setSnackbar({ open: true, message: "Erreur lors de la réinitialisation des règles.", severity: "error" });
      });
  };

  // Icônes pour les catégories
  const getCategoryIcon = (category) => {
    switch (category) {
      case "🔴 Urgent":
        return <Error color="error" />;
      case "💼 Travail":
        return <Work color="primary" />;
      case "🏠 Personnel":
        return <Home color="secondary" />;
      case "📦 Abonnements":
        return <LocalOffer color="info" />;
      case "🗑️ Spam":
        return <Spam />;
      case "📂 Archives":
        return <Archive />;
      default:
        return <Label />;
    }
  };

  return (
    <Box sx={{ padding: 3 }}>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Typography variant="h3" gutterBottom>
        <Mail color="primary" sx={{ verticalAlign: "middle", marginRight: 1 }} />
        EmailSorter Agent
      </Typography>

      <Paper sx={{ padding: 2, marginBottom: 3 }}>
        <Typography variant="h6" gutterBottom>
          Bienvenue dans ton agent de tri d'emails !
        </Typography>
        <Typography paragraph>
          Cet outil va automatiquement classer tes emails dans des catégories (Urgent, Travail, Personnel, etc.)
          et appliquer des actions (déplacer, marquer comme lu, ajouter des étoiles).
        </Typography>
      </Paper>

      {/* Onglets */}
      <Paper sx={{ marginBottom: 3 }}>
        <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
          <Tab icon={<Refresh />} label="Traitement" />
          <Tab icon={<Settings />} label="Règles" />
          <Tab icon={<CheckCircle />} label="Résultats" />
        </Tabs>
      </Paper>

      {/* Onglet Traitement */}
      {tabValue === 0 && (
        <Paper sx={{ padding: 3, marginBottom: 3 }}>
          <Typography variant="h5" gutterBottom>
            Traiter les emails
          </Typography>
          {!isAuthenticated ? (
            <>
              <Typography paragraph>
                Pour commencer, connecte-toi à ton compte Gmail :
              </Typography>
              <Button
                variant="contained"
                color="primary"
                startIcon={<Mail />}
                onClick={handleAuth}
                disabled={loading}
              >
                Se connecter à Gmail
              </Button>
            </>
          ) : (
            <>
              <Typography paragraph>
                Ton compte est connecté. Tu peux maintenant lancer le tri de tes emails.
              </Typography>
              <Box sx={{ display: "flex", gap: 2, marginBottom: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Refresh />}
                  onClick={() => handleProcessEmails(false)}
                  disabled={loading}
                >
                  Traiter les emails
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<CheckCircle />}
                  onClick={() => handleProcessEmails(true)}
                  disabled={loading}
                >
                  Simulation (test)
                </Button>
              </Box>
              {loading && <Typography>Traitement en cours...</Typography>}
            </>
          )}
        </Paper>
      )}

      {/* Onglet Règles */}
      {tabValue === 1 && (
        <Paper sx={{ padding: 3, marginBottom: 3 }}>
          <Typography variant="h5" gutterBottom>
            Personnaliser les règles de tri
          </Typography>
          <Box sx={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Add />}
              onClick={() => {
                setCurrentCategory("");
                setOpenDialog(true);
              }}
            >
              Ajouter une règle
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Refresh />}
              onClick={handleResetRules}
            >
              Réinitialiser
            </Button>
          </Box>

          {Object.entries(customRules).map(([category, rule]) => (
            <Box key={category} sx={{ marginBottom: 3 }}>
              <Typography variant="h6" gutterBottom>
                {getCategoryIcon(category)} {category}
              </Typography>
              <Box sx={{ display: "flex", gap: 2 }}>
                <Paper sx={{ flex: 1, padding: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Mots-clés :
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {rule.keywords.map((keyword, index) => (
                      <Chip
                        key={index}
                        label={keyword}
                        onDelete={() => handleDeleteRule(category, "keyword", index)}
                        color="primary"
                      />
                    ))}
                  </Box>
                </Paper>
                <Paper sx={{ flex: 1, padding: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    Expéditeurs :
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                    {rule.senders.map((sender, index) => (
                      <Chip
                        key={index}
                        label={sender}
                        onDelete={() => handleDeleteRule(category, "sender", index)}
                        color="secondary"
                      />
                    ))}
                  </Box>
                </Paper>
              </Box>
            </Box>
          ))}

          {/* Dialogue pour ajouter une règle */}
          <Dialog open={openDialog} onClose={() => setOpenDialog(false)}>
            <DialogTitle>Ajouter une règle</DialogTitle>
            <DialogContent>
              <TextField
                select
                label="Catégorie"
                value={currentCategory}
                onChange={(e) => setCurrentCategory(e.target.value)}
                fullWidth
                sx={{ marginBottom: 2 }}
                SelectProps={{ native: true }}
              >
                <option value="">Sélectionner une catégorie</option>
                {Object.keys(customRules).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </TextField>
              <TextField
                label="Mot-clé"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                fullWidth
                sx={{ marginBottom: 2 }}
                placeholder="Ex: facture"
              />
              <TextField
                label="Expéditeur"
                value={newSender}
                onChange={(e) => setNewSender(e.target.value)}
                fullWidth
                sx={{ marginBottom: 2 }}
                placeholder="Ex: banque@"
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setOpenDialog(false)}>Annuler</Button>
              <Button onClick={handleAddRule} color="primary">
                Ajouter
              </Button>
            </DialogActions>
          </Dialog>
        </Paper>
      )}

      {/* Onglet Résultats */}
      {tabValue === 2 && (
        <Paper sx={{ padding: 3, marginBottom: 3 }}>
          <Typography variant="h5" gutterBottom>
            Résultats du tri
          </Typography>
          {emails.length === 0 ? (
            <Typography>Aucun email traité pour le moment.</Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Expéditeur</TableCell>
                    <TableCell>Objet</TableCell>
                    <TableCell>Catégorie</TableCell>
                    <TableCell>Actions</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell>Pièce jointe</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {emails.map((email, index) => (
                    <TableRow key={index}>
                      <TableCell>{email.sender}</TableCell>
                      <TableCell>{email.subject}</TableCell>
                      <TableCell>
                        {getCategoryIcon(email.category)} {email.category}
                      </TableCell>
                      <TableCell>{email.actions}</TableCell>
                      <TableCell>{email.date}</TableCell>
                      <TableCell>
                        {email.has_attachment ? <CheckCircle color="success" /> : <Info color="disabled" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}
    </Box>
  );
}

export default App;