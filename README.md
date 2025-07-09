# 🍺 Pintwise - Pint Debt Tracker

A simple, elegant web application to track pints owed between friends. Built for GitHub Pages with SQLite Cloud integration.

## Features

- **Track Pint Debts**: Record who owes pints to whom
- **Real-time Updates**: Changes are saved automatically to SQLite Cloud
- **Net Balance Calculator**: See consolidated debts between people
- **Search & Filter**: Find specific entries or people quickly
- **Responsive Design**: Works perfectly on mobile and desktop
- **Offline Demo Mode**: Works even without database connection

## Live Demo

Visit the live application: [Your GitHub Pages URL]

## Setup Instructions

### 1. Fork/Clone this Repository

```bash
git clone https://github.com/yourusername/pintwise.git
cd pintwise
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set up SQLite Cloud Database

1. Sign up for [SQLite Cloud](https://sqlitecloud.io/)
2. Create a new database
3. Note your connection string (format: `sqlitecloud://xxx.sqlite.cloud:8860/database.sqlite?apikey=xxx`)

### 4. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Add a new repository secret:
   - **Name**: `SQLITE_CONNECTION_STRING`
   - **Value**: Your SQLite Cloud connection string

### 5. Enable GitHub Pages

1. Go to Settings → Pages
2. Set Source to "GitHub Actions"
3. The app will automatically deploy when you push to main branch

### 6. Local Development

For local development, create a `.env` file:

```bash
SQLITE_CONNECTION_STRING=your_connection_string_here
```

Then run:

```bash
npm start
```

## How to Use

### Adding Pint Entries

1. Click "Add Pint" in the navigation
2. Enter who owes the pint and who is owed
3. Optionally add a description and specify number of pints
4. Click "Add Pint Entry"

### Managing Debts

- **Pending Tab**: View all unpaid pints with options to mark as paid or delete
- **All Pints Tab**: See complete history of all transactions
- **Net Balances Tab**: View consolidated debts between people

### Search and Filter

Use the search bar to find entries by:
- Person names (debtor or creditor)
- Description text

## Database Schema

The app uses a simple SQLite table:

```sql
CREATE TABLE pint_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debtor TEXT NOT NULL,
    creditor TEXT NOT NULL,
    description TEXT,
    amount REAL DEFAULT 1.0,
    date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
    date_paid DATETIME,
    status TEXT DEFAULT 'pending'
);
```

## Demo Mode

If no database connection is available, the app automatically switches to demo mode using localStorage. This allows you to:
- Test the application locally
- Use it offline
- Demonstrate features without a database

## Technology Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: SQLite Cloud
- **Build Tool**: Webpack
- **Deployment**: GitHub Actions + GitHub Pages
- **Styling**: Custom CSS with responsive design

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE.txt](LICENSE.txt) file for details.

## Support

If you encounter any issues:

1. Check that your SQLite connection string is correct
2. Ensure the GitHub secret is properly set
3. Verify that GitHub Pages is enabled
4. Check the browser console for error messages

For demo mode (localStorage), data persists only in the current browser.

## Roadmap

- [ ] Export/import functionality
- [ ] User authentication
- [ ] Group management
- [ ] Email notifications
- [ ] Mobile app version
- [ ] Integration with payment apps

---

Made with ❤️ for tracking pint debts between friends!
