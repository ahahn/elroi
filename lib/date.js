(function(elroi, $) {

    /**
     *
     * @param {String}
        The format can be combinations of the following:
     d  - day of month (no leading zero)
     dd - day of month (two digit)
     D  - day name short
     DD - day name long
     m  - month of year (no leading zero)
     mm - month of year (two digit)
     M  - month name short
     MM - month name long
     y  - year (two digit)
     yy - year (four digit)
     h  - hour (single digit)
     hh - hour (two digit)
     H  - hour (military, no leading zero)
     HH  - hour (military, two digit)
     nn - minutes (two digit)
     a - am/pm
     * @param value The date to format
     * @param options Options for the date format; includes ignore zero minutes, and am/pm
     * @return {String} The formatted date
     */
    function formatDate(format, value, options) {
        var DAY_NAMES_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
            DAY_NAMES_LONG = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
            MONTH_NAMES_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
            MONTH_NAMES_LONG = ['January','Feburary','March','April','May','June','July','August','September','October','November','December'],
            MERIDIAN = ['am', 'pm'],
            date = new Date(value),
            dayNamesShort,
            dayNamesLong,
            monthNamesShort,
            monthNamesLong,
            merid,
            formattedDate = "",
            thisChar,
            isDoubled,
            i;

        if (!format) {
            return '';
        }
        options = options || {};
        dayNamesShort = options.dayNamesShort || DAY_NAMES_SHORT;
        dayNamesLong = options.dayNamesLong || DAY_NAMES_LONG;
        monthNamesShort = options.monthNamesShort || MONTH_NAMES_SHORT;
        monthNamesLong = options.monthNamesLong || MONTH_NAMES_LONG;
        merid = options.meridian || MERIDIAN;
        timeSeparator = options.useCustomTimeSeparator || ':';

        for (i = 0; i < format.length; i++) {
            thisChar = format.charAt(i);
            isDoubled = i < format.length && format.charAt(i + 1) === thisChar;

            switch (thisChar) {
                case 'd':
                    if (isDoubled) {
                        if (date.getDate() < 10) {
                            formattedDate += '0';
                        }
                        formattedDate += date.getDate();
                    } else {
                        formattedDate += date.getDate();
                    }
                    break;
                case 'D':
                    formattedDate += isDoubled ? dayNamesLong[date.getDay()] : dayNamesShort[date.getDay()];
                    break;
                case 'm':
                    if (isDoubled) {
                        if (date.getMonth() < 10) {
                            formattedDate += '0';
                        }
                        formattedDate += date.getMonth() + 1;
                    } else {
                        formattedDate += date.getMonth() + 1;
                    }
                    break;
                case 'M':
                    formattedDate += isDoubled ? monthNamesLong[date.getMonth()] : monthNamesShort[date.getMonth()];
                    break;
                case 'y':
                    if (isDoubled) {
                        formattedDate += date.getFullYear();
                    } else {
                        if (date.getFullYear() % 100 < 10) {
                            formattedDate += 0;
                        }
                        formattedDate += date.getFullYear() % 100;
                    }
                    break;
                case 'h':
                    if (isDoubled && date.getHours()  % 12 < 10) {
                        formattedDate += "0";
                    }
                    formattedDate += date.getHours() === 0 ? 12
                        : date.getHours() > 12 ? date.getHours() - 12
                        : date.getHours();
                    break;
                case 'H':
                    formattedDate += isDoubled && date.getHours() < 10 ? "0" + date.getHours() : date.getHours();
                    break;
                case 'n':
                    formattedDate += date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
                    break;
                case 'a':
                    formattedDate += date.getHours() < 12 ? merid[0] : merid[1];
                    break;
                case ':':
                    formattedDate += timeSeparator;
                default:
                    formattedDate += thisChar;
            }
            if (isDoubled) {
                i++;
            }
        }

        return formattedDate;
    }

    /**
     * Strips the year component from the provided date format, including any leading or trailing separator characters
     * which include all whitespace, ',' '/' or '-' characters.
     *
     * NOTE WELL: this assumes that the date format will not put the year in the middle of a format string. If you do
     * that, it will munge separators on both sides; i.e. 'm/y/d' will become 'md'.
     */
    function stripYearFromDateFormat(format) {
        return format.replace(/[,-\/]?\s*y{1,2}\s*[,-\/]?/, '');
    }

    /**
     * Formats the start and end date of a date range as a single string, using the provided format string.
     *
     * @param format the date format string, as escribed in the formatDate function
     * @param startDate the start date of the range
     * @param endDate the end date of the range
     * @param options object, supports the following features:
     *     skipRepeatedYear (default true): if true, will remove the year component of the start date when
     *         start and end date are the same year. It will match 'y' 2-digit year, 'yy' full year as well
     *         as any leading and trailing commas, dashes or slashes used to separate.
     */
    function formatDateRange(format, startDate, endDate, options) {
        var skipRepeatedYear,
            startDateFormat,
            endDateFormat,
            formattedDateRange;

        options = options || {};
        startDateFormat = format;
        endDateFormat = format;
        skipRepeatedYear = (options.skipRepeatedYear !== undefined) ? options.skipRepeatedYear : true;
        formattedDateRange = '';

        if (startDate && endDate) {
            // Scrape out duplicate years from startDate and endDate
            if (skipRepeatedYear && startDate.getFullYear() === endDate.getFullYear() && startDateFormat.indexOf('y') > -1) {
                startDateFormat = stripYearFromDateFormat(startDateFormat);
            }
        }

        if (startDate) {
            formattedDateRange += elroi.fn.formatDate(startDateFormat, startDate, options);
        }

        if (startDate && endDate) {
            formattedDateRange += " &ndash; ";
        }

        if (endDate) {
            formattedDateRange += elroi.fn.formatDate(endDateFormat, endDate, options);
            formattedDateRange = formattedDateRange.replace(/\s/g, '&nbsp;');
        }

        return formattedDateRange;
    }

    elroi.fn.formatDate = formatDate;
    elroi.fn.formatDateRange = formatDateRange;
    elroi.fn.stripYearFromDateFormat = stripYearFromDateFormat;

})(elroi, jQuery);
